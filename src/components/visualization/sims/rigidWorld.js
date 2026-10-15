// 「剛体と衝突」のシミュレーションの世界(React にも DOM にも依存しない)。
// 計算は src/utils/vis の collide.js・integrate.js の関数だけで行い、ここは状態を持って関数を呼ぶ順番を決める。
// 長さは m、質量は面密度 1 kg/m² の円(m = πr²)、座標は x が右、y が上(重力は y の負の向き)。
// 円は { c, v, r, m }(collide.js の形)に、つかんだあとで質量を戻すための m0 を足したもの。
// 状態は作り直さず使い回す(毎ステップ配列を作らない)。ただし sweepAndPrune だけは、戻り値の配列を毎回作る。
import {
  circleBox,
  circlesOverlap,
  pairCount,
  reflectVelocity,
  resolveCircles,
  separateCircles,
  sweepAndPrune,
} from '../../../utils/vis/collide.js'
import { advance } from './euler.js'

export const WORLD_W = 4 // 箱の幅 [m]
export const WORLD_H = 3 // 箱の高さ [m]
export const MAX_CIRCLES = 60
export const MAX_SPEED = 15 // 円の速さの上限 [m/s](つかんで強く振ったときに突き抜けない安全弁)

const MAX_PAIRS = pairCount(MAX_CIRCLES)
// 箱の内側を向く法線(reflectVelocity に渡す)
const N_LEFT = [1, 0]
const N_RIGHT = [-1, 0]
const N_FLOOR = [0, 1]
const N_CEIL = [0, -1]

// 乱数(mulberry32)。リセットで同じ並びに戻るよう、種を固定する
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

function limitSpeed(v, max) {
  const s2 = v[0] * v[0] + v[1] * v[1]
  if (s2 > max * max) {
    const k = max / Math.sqrt(s2)
    v[0] *= k
    v[1] *= k
  }
}

// 円 k を、箱の上のほうの格子(ゆらぎつき)に、小さな初速で置く
function initCircle(world, k) {
  const b = world.pool[k]
  const col = k % 10
  const row = Math.floor(k / 10)
  b.c[0] = 0.26 + col * 0.36 + b.jx
  b.c[1] = WORLD_H - 0.25 - row * 0.4 + b.jy
  b.v[0] = b.jvx
  b.v[1] = b.jvy
  b.m = b.m0
}

export function createRigidWorld(count = 24) {
  const rand = makeRandom(20260414)
  const pool = []
  const boxPool = []
  for (let k = 0; k < MAX_CIRCLES; k++) {
    const r = 0.11 + 0.08 * rand()
    const m0 = Math.PI * r * r
    pool.push({
      c: [0, 0],
      v: [0, 0],
      r,
      m: m0,
      m0,
      jx: (rand() - 0.5) * 0.06,
      jy: (rand() - 0.5) * 0.06,
      jvx: (rand() - 0.5) * 2,
      jvy: (rand() - 0.5) * 2,
    })
    boxPool.push({ min: [0, 0], max: [0, 0] })
  }
  const world = {
    pool,
    boxPool,
    n: 0,
    circles: [], // 動いている円(pool の先頭 n 個)
    boxes: [], // その AABB(sweepAndPrune に渡す配列。長さ = n)
    pairs: [], // 最後のサブステップの候補の組
    hit: new Uint8Array(MAX_PAIRS), // pairs[k] が実際に重なっていたか
    stats: { total: 0, candidates: 0, contacts: 0 },
    grab: { index: -1, tx: 0, ty: 0, fromX: 0, fromY: 0, vx: 0, vy: 0 },
  }
  setCount(world, count)
  return world
}

// 円の数を変える。増えた円は初期の位置に置き、減るときは末尾から外す
export function setCount(world, n) {
  const next = Math.max(0, Math.min(MAX_CIRCLES, Math.round(n)))
  if (world.grab.index >= next) releaseGrab(world, 0, 0)
  for (let k = world.n; k < next; k++) initCircle(world, k)
  world.n = next
  world.circles.length = next
  world.boxes.length = next
  for (let i = 0; i < next; i++) {
    world.circles[i] = world.pool[i]
    world.boxes[i] = world.boxPool[i]
  }
  world.pairs = []
  world.stats.total = pairCount(next)
  world.stats.candidates = 0
  world.stats.contacts = 0
}

export function resetWorld(world) {
  releaseGrab(world, 0, 0)
  for (let k = 0; k < world.n; k++) initCircle(world, k)
  world.pairs = []
  world.stats.candidates = 0
  world.stats.contacts = 0
}

// ---- つかむ ----

// (x, y) [m] にいちばん近い円(半径 + slop の内側)をつかむ。つかめたら true
export function grabAt(world, x, y, slop = 0) {
  let best = -1
  let bestD2 = Infinity
  for (let i = 0; i < world.n; i++) {
    const b = world.circles[i]
    const dx = x - b.c[0]
    const dy = y - b.c[1]
    const d2 = dx * dx + dy * dy
    const reach = b.r + slop
    if (d2 <= reach * reach && d2 < bestD2) {
      best = i
      bestD2 = d2
    }
  }
  if (best < 0) return false
  const b = world.circles[best]
  const g = world.grab
  g.index = best
  g.tx = b.c[0]
  g.ty = b.c[1]
  g.vx = 0
  g.vy = 0
  b.m = Infinity // 動かせない物体として扱う(速度はポインタの速度)
  b.v[0] = 0
  b.v[1] = 0
  return true
}

// つかんだ円の目標位置(ポインタの位置)。箱の外には出さない
export function moveGrab(world, x, y) {
  const g = world.grab
  if (g.index < 0) return
  const r = world.circles[g.index].r
  g.tx = Math.max(r, Math.min(WORLD_W - r, x))
  g.ty = Math.max(r, Math.min(WORLD_H - r, y))
}

// 止まっているあいだも、つかんだ円をポインタに合わせて見せる
export function snapGrab(world) {
  const g = world.grab
  if (g.index < 0) return
  const b = world.circles[g.index]
  b.c[0] = g.tx
  b.c[1] = g.ty
}

// 離す。(vx, vy) [m/s] は離す直前のポインタの速度で、そのまま円の速度になる
export function releaseGrab(world, vx, vy) {
  const g = world.grab
  if (g.index < 0) return
  const b = world.pool[g.index]
  b.m = b.m0
  b.v[0] = vx
  b.v[1] = vy
  limitSpeed(b.v, MAX_SPEED)
  g.index = -1
}

// ---- 1 ステップ ----

function collideWalls(b, e) {
  const c = b.c
  const v = b.v
  if (c[0] < b.r) {
    c[0] = b.r
    if (v[0] < 0) reflectVelocity(v, N_LEFT, e, v)
  } else if (c[0] > WORLD_W - b.r) {
    c[0] = WORLD_W - b.r
    if (v[0] > 0) reflectVelocity(v, N_RIGHT, e, v)
  }
  if (c[1] < b.r) {
    c[1] = b.r
    if (v[1] < 0) reflectVelocity(v, N_FLOOR, e, v)
  } else if (c[1] > WORLD_H - b.r) {
    c[1] = WORLD_H - b.r
    if (v[1] > 0) reflectVelocity(v, N_CEIL, e, v)
  }
}

// 広域の判定(AABB + Sweep and Prune)で候補の組を絞り、狭域の判定(円の重なり)をする。
// respond が true なら、重なっていた組に撃力を与えてめり込みを押し戻す。false なら数えるだけ(止まっているあいだの表示用)
export function detectContacts(world, e, respond) {
  const { circles, boxes, hit, stats } = world
  const n = world.n
  for (let i = 0; i < n; i++) circleBox(circles[i].c, circles[i].r, boxes[i])
  const pairs = sweepAndPrune(boxes)
  let contacts = 0
  for (let k = 0; k < pairs.length; k++) {
    const a = circles[pairs[k][0]]
    const b = circles[pairs[k][1]]
    if (circlesOverlap(a.c, a.r, b.c, b.r)) {
      contacts++
      hit[k] = 1
      if (respond) {
        resolveCircles(a, b, e)
        separateCircles(a, b)
      }
    } else {
      hit[k] = 0
    }
  }
  world.pairs = pairs
  stats.total = pairCount(n)
  stats.candidates = pairs.length
  stats.contacts = contacts
}

// 時間 dt を substeps 個に分けて進める。params = { gravity [m/s²], e, substeps }
export function stepWorld(world, params, dt) {
  const { gravity, e, substeps } = params
  const h = dt / substeps
  const { circles, grab } = world
  const n = world.n

  // つかんだ円は、このステップのあいだにポインタの位置まで動く。その速さが円の速度になる
  let gb = null
  if (grab.index >= 0) {
    gb = circles[grab.index]
    grab.fromX = gb.c[0]
    grab.fromY = gb.c[1]
    let dx = grab.tx - grab.fromX
    let dy = grab.ty - grab.fromY
    const max = MAX_SPEED * dt
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > max) {
      dx *= max / d
      dy *= max / d
    }
    grab.dx = dx
    grab.dy = dy
    grab.vx = dx / dt
    grab.vy = dy / dt
  }

  for (let s = 0; s < substeps; s++) {
    // 1. 前進オイラー法(位置は古い速度で、速度は重力で)
    for (let i = 0; i < n; i++) {
      const b = circles[i]
      if (b === gb) {
        const f = (s + 1) / substeps
        b.c[0] = grab.fromX + grab.dx * f
        b.c[1] = grab.fromY + grab.dy * f
        b.v[0] = grab.vx
        b.v[1] = grab.vy
        continue
      }
      b.c[0] = advance(b.c[0], b.v[0], h)
      b.c[1] = advance(b.c[1], b.v[1], h)
      b.v[1] = advance(b.v[1], -gravity, h)
      limitSpeed(b.v, MAX_SPEED)
    }
    // 2. 広域の判定と、3. 狭域の判定・応答
    detectContacts(world, e, true)
    // 4. 壁
    for (let i = 0; i < n; i++) collideWalls(circles[i], e)
  }
}
