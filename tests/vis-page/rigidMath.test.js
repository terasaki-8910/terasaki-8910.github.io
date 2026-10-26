// 節「剛体と衝突」の段階のシミュレーションの計算(src/components/visualization/sims/rigidMath.js・rigidKit.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAVITY,
  MAX_SCATTER,
  activeAt,
  bounceTrace,
  bounceWindow,
  broadStats,
  bruteForcePairs,
  createImpact,
  eulerFallError,
  expectedPeak,
  fallEuler,
  fallExact,
  fallTime,
  impactBefore,
  makeScatter,
  overlapInfo,
  packRows,
  pushBack,
  radiusOf,
  stepImpact,
} from '../../src/components/visualization/sims/rigidMath.js'
import { arrowStep, clamp, fmt, fmtVec } from '../../src/components/visualization/sims/rigidKit.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} が ${b} に近くない(差 ${Math.abs(a - b)})`)

// ---- 段階 1: 前進オイラー法 ----

test('段階 1: 点列と解析解のずれは g·Δt·t/2 ちょうどで、Δt に比例する(初速によらない)', () => {
  for (const v0 of [0, 2, -1.5]) {
    for (const dt of [0.2, 0.05, 0.01]) {
      for (const p of fallEuler(1.8, v0, GRAVITY, dt, 0.8)) {
        near(p.y - fallExact(1.8, v0, GRAVITY, p.t), eulerFallError(GRAVITY, dt, p.t), 1e-9)
      }
    }
  }
  // 同じ時刻 t = 0.4 s で、Δt を半分にするとずれも半分
  const errAt = (dt) => {
    const pts = fallEuler(2, 0, GRAVITY, dt, 0.8)
    const p = pts.find((q) => Math.abs(q.t - 0.4) < 1e-9)
    return p.y - fallExact(2, 0, GRAVITY, p.t)
  }
  near(errAt(0.1) / errAt(0.05), 2, 1e-9)
  near(errAt(0.05) / errAt(0.025), 2, 1e-9)
})

test('段階 1: 最初の点は初期値で、速度は g·Δt ずつ下向きに増える。落下時間は √(2h/g)', () => {
  const pts = fallEuler(2, 0, GRAVITY, 0.1, 0.5)
  assert.equal(pts.length, 6)
  assert.deepEqual(pts[0], { t: 0, y: 2, v: 0 })
  near(pts[3].v, -3 * GRAVITY * 0.1)
  near(fallTime(2, 0, GRAVITY), Math.sqrt((2 * 2) / GRAVITY))
  near(fallExact(2, 0, GRAVITY, fallTime(2, 0, GRAVITY)), 0, 1e-12)
  near(fallExact(1, 3, GRAVITY, fallTime(1, 3, GRAVITY)), 0, 1e-12)
})

// ---- 段階 2: 反発係数 ----

test('段階 2: 跳ね返りの高さは e² 倍ずつになる(Δt = 1/4000 s で、3 回目の頂点まで予想 e^(2k)·h0 の 2 % 以内)', () => {
  for (const [h0, e] of [[2.5, 0.7], [1.5, 0.5], [2.8, 0.85], [2, 0.6]]) {
    const { peaks } = bounceTrace({ h0, e, dt: 1 / 4000, tEnd: 12 })
    assert.ok(peaks.length >= 4, `頂点が ${peaks.length} 個`)
    for (let k = 1; k <= 3; k++) {
      assert.ok(Math.abs(peaks[k] / expectedPeak(h0, e, k) - 1) < 0.02, `h0=${h0} e=${e} k=${k}: ${peaks[k]} と ${expectedPeak(h0, e, k)}`)
      assert.ok(Math.abs(peaks[k] / peaks[k - 1] / (e * e) - 1) < 0.02, `h0=${h0} e=${e} k=${k}: 1 回前との比が e² から外れた`)
    }
  }
})

test('段階 2: e = 0 は跳ねず、e が大きいほど高く跳ねる。最初の頂点は落とした高さ', () => {
  const stick = bounceTrace({ h0: 2, e: 0, dt: 1 / 480, tEnd: 4 })
  assert.deepEqual(stick.peaks, [2])
  assert.ok(Math.min(...stick.h) >= 0, '床の下に出ない')
  const high = bounceTrace({ h0: 2, e: 0.9, dt: 1 / 480, tEnd: 4 })
  const low = bounceTrace({ h0: 2, e: 0.5, dt: 1 / 480, tEnd: 4 })
  assert.ok(high.peaks[1] > low.peaks[1])
  assert.equal(high.peaks[0], 2)
  for (const hh of [...high.h, ...low.h]) assert.ok(hh >= 0 && hh <= 2 + 1e-9)
})

test('段階 2: Δt を粗くすると予想からのずれが大きくなる(細かい方が e² 倍に近い)', () => {
  const miss = (dt) => {
    const { peaks } = bounceTrace({ h0: 2.5, e: 0.7, dt, tEnd: 6 })
    return Math.abs(peaks[1] / expectedPeak(2.5, 0.7, 1) - 1)
  }
  assert.ok(miss(1 / 480) < miss(1 / 60))
})

test('段階 2: グラフの時間の長さは 1.5〜6 s で、e が大きいほど長い', () => {
  assert.ok(bounceWindow(2.5, 0.2) >= 1.5)
  assert.ok(bounceWindow(2.8, 1) <= 6)
  assert.ok(bounceWindow(2.5, 0.9) > bounceWindow(2.5, 0.5))
})

// ---- 段階 3: 円の重なり判定 ----

test('段階 3: d² ≤ (r1+r2)² で重なり、ちょうど接していれば重なる側。平方根を使わなくても距離で比べたのと同じ', () => {
  assert.equal(overlapInfo([0, 0], 1, [2, 0], 1).overlap, true) // 接している
  assert.equal(overlapInfo([0, 0], 1, [2.01, 0], 1).overlap, false)
  assert.equal(overlapInfo([0, 0], 1, [1, 1], 0.5).overlap, true)
  const info = overlapInfo([0.3, 0.4], 0.2, [1.1, 1.0], 0.5)
  near(info.d2, 0.8 * 0.8 + 0.6 * 0.6)
  near(info.rr2, 0.49)
  near(info.d, 1)
  assert.equal(info.overlap, false)
  // 乱数で、距離で比べた結果と必ず一致する
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 500; i++) {
    const c1 = [rnd() * 4, rnd() * 3]
    const c2 = [rnd() * 4, rnd() * 3]
    const r1 = 0.1 + rnd() * 0.5
    const r2 = 0.1 + rnd() * 0.5
    const f = overlapInfo(c1, r1, c2, r2)
    assert.equal(f.overlap, Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) <= r1 + r2)
    assert.equal(f.overlap, f.d2 <= f.rr2)
  }
})

// ---- 段階 4: 広域の判定 ----

test('段階 4: 総当たりは N(N−1)/2、候補はそれ以下、衝突は候補以下で、候補は AABB の総当たりと同じ組', () => {
  const pool = makeScatter()
  assert.equal(pool.length, MAX_SCATTER)
  for (const n of [2, 10, 20, 40]) {
    const s = broadStats(pool.slice(0, n))
    assert.equal(s.total, (n * (n - 1)) / 2)
    assert.ok(s.contacts <= s.candidates && s.candidates <= s.xOverlap && s.xOverlap <= s.total)
    const key = (p) => p.join(',')
    assert.deepEqual(s.pairs.map(key).sort(), bruteForcePairs(s.boxes).map(key).sort())
    // 衝突の組は、円の距離で数えたものと同じ
    let direct = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.hypot(pool[i].c[0] - pool[j].c[0], pool[i].c[1] - pool[j].c[1]) <= pool[i].r + pool[j].r) direct++
      }
    }
    assert.equal(s.contacts, direct)
  }
  const forty = broadStats(pool)
  assert.ok(forty.candidates < forty.total / 3, `候補 ${forty.candidates} 組が総当たり ${forty.total} 組を絞っていない`)
  // 見せる配置では、候補が衝突より何組か多い(箱は重なるが円は重ならない組がある)
  const twenty = broadStats(pool.slice(0, 20))
  assert.ok(twenty.candidates - twenty.contacts >= 3 && twenty.contacts >= 3, `20 個: 候補 ${twenty.candidates}・衝突 ${twenty.contacts}`)
  assert.ok(forty.candidates - forty.contacts >= 5, `40 個: 候補 ${forty.candidates}・衝突 ${forty.contacts}`)
})

test('段階 4: 置き場の先頭の円は、数を変えても同じ位置。円はすべて箱の中', () => {
  const a = makeScatter(10)
  const b = makeScatter(40)
  assert.deepEqual(a, b.slice(0, 10))
  for (const { c, r } of b) assert.ok(c[0] >= r && c[0] <= 4 - r && c[1] >= r && c[1] <= 3 - r)
})

test('段階 4: 走査線の発見位置は、組の 2 つの箱の左端のうち右側。x の区間は同じ段で重ならない', () => {
  const s = broadStats(makeScatter(30))
  s.pairs.forEach(([i, j], k) => {
    near(s.foundX[k], Math.max(s.boxes[i].min[0], s.boxes[j].min[0]))
    assert.ok(s.foundX[k] <= Math.min(s.boxes[i].max[0], s.boxes[j].max[0]) + 1e-12, 'x で重なっている組だけが候補')
  })
  const { row, rows } = packRows(s.boxes)
  for (let i = 0; i < s.boxes.length; i++) {
    for (let j = i + 1; j < s.boxes.length; j++) {
      if (row[i] !== row[j]) continue
      assert.ok(s.boxes[i].max[0] < s.boxes[j].min[0] || s.boxes[j].max[0] < s.boxes[i].min[0], `箱 ${i} と ${j} が同じ段で重なる`)
    }
  }
  // 段の数 = 同時に重なる箱の最大数
  let most = 0
  for (const b of s.boxes) most = Math.max(most, activeAt(s.boxes, b.min[0]).length)
  assert.equal(rows, most)
})

// ---- 段階 5: 撃力による応答 ----

function runImpact(init, steps = 4000, dt = 1 / 480) {
  const s = createImpact(init)
  for (let k = 0; k < steps && !s.hit; k++) stepImpact(s, dt)
  return s
}

test('段階 5: 運動量の合計は衝突の前後で保存される(質量・反発係数・向きによらない)', () => {
  const cases = [
    { c1: [0.7, 1.5], v1: [1.6, 0], m1: 1, c2: [2.8, 1.5], v2: [-0.4, 0], m2: 2, e: 0.6 },
    { c1: [0.7, 1.4], v1: [2.2, 0.3], m1: 4, c2: [2.8, 1.6], v2: [-1.1, -0.2], m2: 0.5, e: 1 },
    { c1: [0.7, 1.5], v1: [1.0, 0], m1: 0.5, c2: [2.0, 1.7], v2: [0, 0], m2: 5, e: 0 },
    { c1: [0.7, 1.5], v1: [1.8, 0.4], m1: 2, c2: [2.4, 1.9], v2: [-0.8, -0.5], m2: 3, e: 0.25 },
  ]
  for (const init of cases) {
    const s = runImpact(init)
    assert.ok(s.hit, `ぶつからなかった: ${JSON.stringify(init)}`)
    const { before, after } = s.hit
    near(after.p[0], before.p[0], 1e-9)
    near(after.p[1], before.p[1], 1e-9)
    near(before.p[0], init.m1 * init.v1[0] + init.m2 * init.v2[0], 1e-12)
  }
})

test('段階 5: 近づく速さは衝突の後に −e 倍になる。e = 1 ならエネルギーも保存、e < 1 なら減る', () => {
  const base = { c1: [0.7, 1.5], v1: [1.6, 0.2], m1: 1, c2: [2.8, 1.6], v2: [-0.4, 0], m2: 2 }
  for (const e of [0, 0.3, 0.7, 1]) {
    const s = runImpact({ ...base, e })
    const { before, after } = s.hit
    assert.ok(before.u > 0, '近づいている')
    near(after.u, -e * before.u, 1e-9)
    if (e === 1) near(after.K, before.K, 1e-9)
    else assert.ok(after.K < before.K)
  }
})

test('段階 5: 離れていく組は何も起きず、ぶつからない配置は hit のまま null。ぶつかる前の値は init から出せる', () => {
  const away = runImpact({ c1: [1, 1.5], v1: [-1, 0], m1: 1, c2: [1.3, 1.5], v2: [1, 0], m2: 1, e: 0.5 }, 200)
  assert.equal(away.hit, null)
  const miss = runImpact({ c1: [0.5, 0.5], v1: [1, 0], m1: 1, c2: [2.8, 2.5], v2: [-1, 0], m2: 1, e: 0.5 }, 2000)
  assert.equal(miss.hit, null)
  const b = impactBefore({ c1: [0, 0], v1: [2, 0], m1: 1, c2: [1, 0], v2: [-1, 0], m2: 3 })
  near(b.p[0], 2 - 3)
  near(b.u, 3)
  near(b.K, 0.5 * 4 + 0.5 * 3)
})

test('段階 5: 同じ質量の正面衝突 e = 1 は速度が入れ替わる。重い円は速度があまり変わらない', () => {
  const swap = runImpact({ c1: [0.7, 1.5], v1: [1.5, 0], m1: 1, c2: [2.8, 1.5], v2: [-0.5, 0], m2: 1, e: 1 })
  near(swap.hit.after.v1[0], -0.5, 1e-9)
  near(swap.hit.after.v2[0], 1.5, 1e-9)
  const heavy = runImpact({ c1: [0.7, 1.5], v1: [1.5, 0], m1: 0.5, c2: [2.8, 1.5], v2: [0, 0], m2: 8, e: 0.5 })
  assert.ok(Math.abs(heavy.hit.after.v2[0]) < 0.4, '重い円はほとんど動かない')
  assert.ok(heavy.hit.after.v1[0] < 0, '軽い円ははね返る')
})

// ---- 段階 6: めり込みの押し戻し ----

test('段階 6: 押し戻す量の和はめり込みの深さで、質量の逆数に比例して動く(軽い円が大きく動く)。押し戻した後は接する', () => {
  const m1 = 1
  const m2 = 3
  const r1 = radiusOf(m1)
  const r2 = radiusOf(m2)
  const res = pushBack([1.6, 1.5], r1, m1, [1.95, 1.5], r2, m2)
  near(res.depth, r1 + r2 - 0.35)
  near(res.s1 + res.s2, res.depth)
  near(res.s1 / res.s2, m2 / m1)
  near(Math.hypot(res.c2[0] - res.c1[0], res.c2[1] - res.c1[1]), r1 + r2)
  // 質量で重みづけた中心は動かない(m1·s1 = m2·s2)
  near(m1 * res.s1, m2 * res.s2)
  // 重なっていなければ動かさない
  const apart = pushBack([0, 0], 0.2, 1, [1, 0], 0.2, 1)
  assert.equal(apart.depth, 0)
  assert.deepEqual(apart.c1, [0, 0])
})

test('段階 6: 質量が無限大の円は動かず、もう一方が全部を押し戻す。入力の配列は書き換えない', () => {
  const c1 = [1, 1]
  const c2 = [1.2, 1]
  const res = pushBack(c1, 0.3, Infinity, c2, 0.3, 2)
  assert.equal(res.w1, 0)
  assert.equal(res.s1, 0)
  near(res.s2, res.depth)
  assert.deepEqual(res.c1, [1, 1])
  near(res.c2[0], 1.6)
  assert.deepEqual(c1, [1, 1])
  assert.deepEqual(c2, [1.2, 1])
})

// ---- 補助 ----

test('rigidKit: 表示の数はマイナスを − にし、-0 を出さない。矢印キーは Shift で 5 倍', () => {
  assert.equal(fmt(-1.234, 2), '−1.23')
  assert.equal(fmt(-0.001, 2), '0.00')
  assert.equal(fmt(0, 1), '0.0')
  assert.equal(fmtVec([1.5, -2], 1), '(1.5, −2.0)')
  assert.deepEqual(arrowStep({ key: 'ArrowUp', shiftKey: false }), { dx: 0, dy: 1 })
  assert.deepEqual(arrowStep({ key: 'ArrowLeft', shiftKey: true }), { dx: -5, dy: 0 })
  assert.equal(arrowStep({ key: 'a' }), null)
  assert.equal(arrowStep({ key: 'ArrowLeft', altKey: true }), null)
  assert.equal(arrowStep({ key: 'ArrowRight', metaKey: true }), null)
  assert.equal(clamp(5, 0, 3), 3)
  assert.equal(clamp(-1, 0, 3), 0)
})
