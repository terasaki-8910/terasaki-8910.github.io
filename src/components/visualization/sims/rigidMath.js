// 節「剛体と衝突」の段階のシミュレーションの計算(React にも DOM にも依存しない。Node から読める)。
// 計算は src/utils/vis の collide.js と、euler.js の advance(integrate.js の前進オイラー法)の関数だけで行い、
// ここは「段階ごとの小さな世界」を作って、関数を呼ぶ順番を決める。ページ(rigidStep*.jsx)は画面と操作だけ。
// 長さは m、質量は kg、座標は x が右、y が上(重力は y の負の向き)。
import {
  aabbOverlap,
  circleBox,
  circlesOverlap,
  pairCount,
  reflectVelocity,
  resolveCircles,
  separateCircles,
  sweepAndPrune,
} from '../../../utils/vis/collide.js'
import { advance } from './euler.js'

export const GRAVITY = 9.8 // 重力加速度 [m/s²]

// 乱数(mulberry32)。同じ種なら同じ並び
function makeRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 段階 1: 運動方程式と前進オイラー法 ----

// 解析解: 初速 v0 [m/s](上向きが正)で高さ y0 から投げた物の、時刻 t の高さ
export function fallExact(y0, v0, g, t) {
  return y0 + v0 * t - 0.5 * g * t * t
}

// 高さ 0 に着く時刻(解析解)
export function fallTime(y0, v0, g) {
  return (v0 + Math.sqrt(v0 * v0 + 2 * g * y0)) / g
}

// 前進オイラー法の点列: 時刻 k·dt(k = 0 … tEnd/dt)の { t, y, v }。
// 位置は古い速度で、速度は重力で進める(rigidWorld と同じ順)
export function fallEuler(y0, v0, g, dt, tEnd) {
  const points = []
  const n = Math.floor(tEnd / dt + 1e-9)
  let y = y0
  let v = v0
  for (let k = 0; k <= n; k++) {
    points.push({ t: k * dt, y, v })
    const yNext = advance(y, v, dt)
    v = advance(v, -g, dt)
    y = yNext
  }
  return points
}

// 点列と解析解のずれの理論値: y_数値(t) − y_解析(t) = g·Δt·t / 2(t が Δt の倍数のとき。初速によらない)。Δt に比例する
export function eulerFallError(g, dt, t) {
  return 0.5 * g * dt * t
}

// ---- 段階 2: 反発係数 ----

const N_FLOOR = [0, 1]
const MAX_PEAKS = 8 // 数える頂点の数(小さく跳ねつづける分は数えない)

// 床(高さ 0)で跳ね返る 1 つの円の、高さ h の時間変化。h0 から静かに落として tEnd まで。
// 時間は dt ずつ、前進オイラー法で進め、床に着いたら reflectVelocity で速度を反転して e 倍にする。
// 返すもの: t・h(各時刻の高さ)、peaks(頂点の高さ。peaks[0] は落とした高さ h0)、peakTimes(その時刻)
export function bounceTrace({ h0, e, g = GRAVITY, dt, tEnd }) {
  const n = Math.floor(tEnd / dt + 1e-9)
  const t = new Array(n + 1)
  const h = new Array(n + 1)
  const peaks = [h0]
  const peakTimes = [0]
  const vec = [0, 0]
  let y = h0
  let v = 0
  for (let k = 0; k <= n; k++) {
    t[k] = k * dt
    h[k] = y
    let yNext = advance(y, v, dt)
    let vNext = advance(v, -g, dt)
    if (yNext < 0) {
      yNext = 0
      if (vNext < 0) {
        vec[1] = vNext
        reflectVelocity(vec, N_FLOOR, e, vec)
        vNext = vec[1]
      }
    }
    if (v > 0 && vNext <= 0 && peaks.length < MAX_PEAKS) {
      peaks.push(yNext)
      peakTimes.push((k + 1) * dt)
    }
    y = yNext
    v = vNext
  }
  return { t, h, peaks, peakTimes }
}

// k 回目に跳ね返ったあとの頂点の高さの予想: e^(2k)·h0(速さが e 倍 → 高さは速さの 2 乗に比例して e² 倍)
export function expectedPeak(h0, e, k) {
  return h0 * e ** (2 * k)
}

// グラフに入れる時間の長さ: 落ちて count 回跳ね返るまで(1.5 s 以上、6 s 以下)
export function bounceWindow(h0, e, g = GRAVITY, count = 4) {
  let sum = 0
  for (let k = 1; k <= count; k++) sum += e ** k
  const total = Math.sqrt((2 * h0) / g) * (1 + 2 * sum)
  return Math.min(6, Math.max(1.5, total * 1.05))
}

// ---- 段階 3: 円の重なり判定 ----

// 中心間の距離の 2 乗 d²、半径の和の 2 乗 (r1+r2)²、重なっているか(d² ≤ (r1+r2)²)
export function overlapInfo(c1, r1, c2, r2) {
  const dx = c1[0] - c2[0]
  const dy = c1[1] - c2[1]
  const d2 = dx * dx + dy * dy
  return { d2, rr2: (r1 + r2) * (r1 + r2), d: Math.sqrt(d2), overlap: circlesOverlap(c1, r1, c2, r2) }
}

// ---- 段階 4: 広域の判定(AABB と Sweep and Prune) ----

export const BROAD_W = 4
export const BROAD_H = 3
export const MAX_SCATTER = 40

// 箱の中にばらまいた円の置き場(先頭から n 個を使う。n を変えても先頭の円は同じ位置)。
// 種 137 は、20 個のときも 40 個のときも、候補が衝突より何組か多く出る(箱は重なるが円は重ならない組がある)ものを選んだ
export function makeScatter(count = MAX_SCATTER, seed = 137) {
  const rand = makeRandom(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const r = 0.12 + 0.1 * rand()
    out.push({ c: [r + (BROAD_W - 2 * r) * rand(), r + (BROAD_H - 2 * r) * rand()], r })
  }
  return out
}

// 円の列 [{ c, r }] に広域の判定をかけた数と組。
//   total       総当たり N(N−1)/2
//   xOverlap    x の区間が重なる組(Sweep and Prune が中身を調べる組)
//   candidates  AABB が重なる組(sweepAndPrune の返す候補)
//   contacts    その中で円が重なっている組
//   pairs       候補の組 [i, j]。hit[k] は pairs[k] の円が重なっているか、foundX[k] は走査線が両方の左端を越える x
//   boxes       各円の AABB
export function broadStats(circles) {
  const n = circles.length
  const boxes = circles.map((b) => circleBox(b.c, b.r))
  const pairs = sweepAndPrune(boxes)
  let xOverlap = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (boxes[i].min[0] <= boxes[j].max[0] && boxes[j].min[0] <= boxes[i].max[0]) xOverlap++
    }
  }
  const hit = pairs.map(([i, j]) => circlesOverlap(circles[i].c, circles[i].r, circles[j].c, circles[j].r))
  const foundX = pairs.map(([i, j]) => Math.max(boxes[i].min[0], boxes[j].min[0]))
  return {
    n,
    boxes,
    pairs,
    hit,
    foundX,
    total: pairCount(n),
    xOverlap,
    candidates: pairs.length,
    contacts: hit.filter(Boolean).length,
  }
}

// x 軸に落とした区間を、重ならないように段(row)に並べる(左端の順に、入る段のうち最初のものへ)。
// 段の数は、同時に重なる区間の最大数(= 走査線にかかる箱の最大数)
export function packRows(boxes) {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].min[0] - boxes[b].min[0])
  const rowEnd = []
  const row = new Array(boxes.length)
  for (const i of order) {
    let r = rowEnd.findIndex((end) => end < boxes[i].min[0])
    if (r < 0) {
      r = rowEnd.length
      rowEnd.push(0)
    }
    rowEnd[r] = boxes[i].max[0]
    row[i] = r
  }
  return { row, rows: rowEnd.length }
}

// 走査線 x にかかっている箱(x の区間が x を含む箱)の番号
export function activeAt(boxes, x) {
  const out = []
  for (let i = 0; i < boxes.length; i++) if (boxes[i].min[0] <= x && x <= boxes[i].max[0]) out.push(i)
  return out
}

// 念のための総当たり(テストで sweepAndPrune と比べる)
export function bruteForcePairs(boxes) {
  const out = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (aabbOverlap(boxes[i], boxes[j])) out.push([i, j])
  }
  return out
}

// ---- 段階 5・6: 2 つの円 ----

// 質量 m の円の見かけの半径(面積に比例。段階 5・6 で重い円を大きく見せる)
export function radiusOf(m) {
  return 0.26 * Math.sqrt(m)
}

const dotv = (a, b) => a[0] * b[0] + a[1] * b[1]

function snapshot(a, b, n) {
  return {
    v1: [a.v[0], a.v[1]],
    v2: [b.v[0], b.v[1]],
    p: [a.m * a.v[0] + b.m * b.v[0], a.m * a.v[1] + b.m * b.v[1]],
    K: 0.5 * a.m * dotv(a.v, a.v) + 0.5 * b.m * dotv(b.v, b.v),
    u: (a.v[0] - b.v[0]) * n[0] + (a.v[1] - b.v[1]) * n[1], // 近づく速さ (v1 − v2)·n
  }
}

// 段階 5: 重力のない所で 2 つの円を等速で動かし、最初に重なったとき撃力で速度を変える。
//   init = { c1, v1, m1, c2, v2, m2, e }(c は位置、v は速度)。半径は radiusOf(m)
//   state.hit は、ぶつかった瞬間に { n, j, before, after } になる。before・after は { v1, v2, p, K, u }
//   (p は運動量の合計、K は運動エネルギーの合計、u は近づく速さ (v1 − v2)·n。n は円 1 から円 2 へ向かう単位法線)
export function createImpact({ c1, v1, m1, c2, v2, m2, e }) {
  return {
    a: { c: [c1[0], c1[1]], v: [v1[0], v1[1]], r: radiusOf(m1), m: m1 },
    b: { c: [c2[0], c2[1]], v: [v2[0], v2[1]], r: radiusOf(m2), m: m2 },
    e,
    t: 0,
    hit: null,
  }
}

export function stepImpact(s, dt) {
  const { a, b } = s
  for (let k = 0; k < 2; k++) {
    a.c[k] = advance(a.c[k], a.v[k], dt)
    b.c[k] = advance(b.c[k], b.v[k], dt)
  }
  s.t += dt
  if (s.hit || !circlesOverlap(a.c, a.r, b.c, b.r)) return
  const dx = b.c[0] - a.c[0]
  const dy = b.c[1] - a.c[1]
  const dist = Math.sqrt(dx * dx + dy * dy)
  const n = dist > 0 ? [dx / dist, dy / dist] : [1, 0]
  const before = snapshot(a, b, n)
  const j = resolveCircles(a, b, s.e)
  if (j > 0) {
    separateCircles(a, b)
    s.hit = { n, j, before, after: snapshot(a, b, n) }
  }
}

// 段階 5 の、ぶつかる前の値(init から。ぶつかる前でも表に出す)
export function impactBefore({ c1, v1, m1, c2, v2, m2 }) {
  const dx = c2[0] - c1[0]
  const dy = c2[1] - c1[1]
  const dist = Math.sqrt(dx * dx + dy * dy)
  const n = dist > 0 ? [dx / dist, dy / dist] : [1, 0]
  return snapshot({ v: v1, m: m1 }, { v: v2, m: m2 }, n)
}

// 段階 6: めり込んだ 2 つの円を押し戻す。質量の逆数 w = 1/m に比例して動く(m = Infinity は w = 0 で動かない)。
// 返すもの: depth(めり込みの深さ。重なっていなければ 0)、w1・w2、s1・s2(各円の動く距離)、c1・c2(押し戻した後の中心)
export function pushBack(c1, r1, m1, c2, r2, m2) {
  const a = { c: [c1[0], c1[1]], r: r1, m: m1 }
  const b = { c: [c2[0], c2[1]], r: r2, m: m2 }
  const depth = separateCircles(a, b)
  return {
    depth,
    w1: 1 / m1,
    w2: 1 / m2,
    s1: Math.hypot(a.c[0] - c1[0], a.c[1] - c1[1]),
    s2: Math.hypot(b.c[0] - c2[0], b.c[1] - c2[1]),
    c1: a.c,
    c2: b.c,
  }
}
