import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reflectVelocity,
  circlesOverlap,
  pairCount,
  circleBox,
  aabbOverlap,
  sweepAndPrune,
  support,
  minkowskiSupport,
  gjkIntersect,
  resolveCircles,
  separateCircles,
} from '../../src/utils/vis/collide.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)

// 円の物体: 中心 c、速度 v、半径 r、質量 m
const body = (x, y, vx, vy, r = 1, m = 1) => ({ c: [x, y], v: [vx, vy], r, m })
const momentum = (...bodies) => [
  bodies.reduce((s, b) => s + b.m * b.v[0], 0),
  bodies.reduce((s, b) => s + b.m * b.v[1], 0),
]
const kinetic = (...bodies) => bodies.reduce((s, b) => s + 0.5 * b.m * (b.v[0] ** 2 + b.v[1] ** 2), 0)
const sortPairs = (pairs) => pairs.map(([i, j]) => [i, j]).sort((p, q) => p[0] - q[0] || p[1] - q[1])

// ---------------------------------------------------------------------------
// 反発
// ---------------------------------------------------------------------------

test('e=0.8, h=1, g=9.8 で、当たる速さ 4.427、跳ね返り 3.542、上がる高さ 0.64', () => {
  const e = 0.8
  const h = 1
  const g = 9.8
  const speed = Math.sqrt(2 * g * h) // m·g·h = ½·m·v² から
  const vr = reflectVelocity([0, -speed], [0, 1], e)
  assert.equal(round(speed, 3), 4.427)
  assert.equal(round(vr[1], 3), 3.542)
  assert.equal(vr[0], 0)
  assert.equal(round(vr[1] ** 2 / (2 * g), 2), 0.64) // 跳ね返って上がる高さ h' = e²·h
  near(vr[1] ** 2 / 2 / (speed ** 2 / 2), e * e) // 運動エネルギーは e² 倍
  near(Math.sqrt(vr[1] ** 2 / (2 * g) / h), e) // 高さの比から e = √(h'/h) と測れる
})

test('反発は法線方向の速度だけを -e 倍にし、接線方向は変えない(斜めの面でも)', () => {
  assert.deepEqual(reflectVelocity([3, -4], [0, 1], 0.5), [3, 2])
  const rng = makeRng(11)
  for (let trial = 0; trial < 200; trial++) {
    const theta = rng() * 2 * Math.PI
    const n = [Math.cos(theta), Math.sin(theta)]
    const t = [-n[1], n[0]]
    let v = [rng() * 10 - 5, rng() * 10 - 5]
    if (dot(v, n) > 0) v = [-v[0], -v[1]] // 面に近づく向きにそろえる
    const e = rng()
    const vr = reflectVelocity(v, n, e)
    near(dot(vr, n), -e * dot(v, n))
    near(dot(vr, t), dot(v, t))
  }
})

test('e=1 で速さが変わらず、e=0 で法線方向の成分がなくなる', () => {
  const n = [0.6, 0.8]
  const v = [-3, -1]
  near(Math.hypot(...reflectVelocity(v, n, 1)), Math.hypot(...v))
  near(dot(reflectVelocity(v, n, 0), n), 0)
})

test('out に v 自身を渡しても、その場で正しく書き換わる', () => {
  const v = [3, -4]
  const result = reflectVelocity(v, [0, 1], 0.5, v)
  assert.equal(result, v)
  assert.deepEqual(v, [3, 2])
})

test('3 次元でも同じ式で動く', () => {
  assert.deepEqual(reflectVelocity([1, 2, -6], [0, 0, 1], 0.5), [1, 2, 3])
})

test('刻み 1e-4 で落下を追い、床で反発させると、1 回目の跳ね返りの頂点が e²·h=0.64 に近い', () => {
  const g = 9.8
  const e = 0.8
  const dt = 1e-4
  const y = [1]
  const v = [0, 0]
  let bounced = false
  let peak = 0
  for (let step = 0; step < 100000; step++) {
    v[1] -= g * dt // 速度を先に更新して、
    y[0] += v[1] * dt // 新しい速度で位置を更新する
    if (y[0] < 0 && v[1] < 0) {
      y[0] = 0
      reflectVelocity(v, [0, 1], e, v)
      bounced = true
    }
    if (bounced) {
      peak = Math.max(peak, y[0])
      if (v[1] < 0) break // 頂点を過ぎた
    }
  }
  assert.ok(bounced)
  near(peak, 0.64, 2e-3)
})

// ---------------------------------------------------------------------------
// 円(球)どうしの判定
// ---------------------------------------------------------------------------

test('r1=1, r2=1.5 で c2=(2,1) は √5 ≤ 2.5 で重なり(めり込み 0.264)、c2=(2,2) は √8 > 2.5 で離れている', () => {
  assert.equal(circlesOverlap([0, 0], 1, [2, 1], 1.5), true)
  assert.equal(round(Math.sqrt(5), 3), 2.236)
  assert.equal(round(2.5 - Math.sqrt(5), 3), 0.264)
  assert.equal(circlesOverlap([0, 0], 1, [2, 2], 1.5), false)
  assert.equal(round(Math.sqrt(8), 3), 2.828)
})

test('ちょうど接していれば重なっている(3-4-5 の三角形で距離 5 = 1 + 4)', () => {
  assert.equal(circlesOverlap([0, 0], 1, [3, 4], 4), true)
  assert.equal(circlesOverlap([0, 0], 1, [3, 4], 3.999), false)
})

test('2 乗のまま比べる判定は、平方根を使う判定と 10000 組(3 次元)で全部一致する', () => {
  const rng = makeRng(0)
  let hits = 0
  for (let trial = 0; trial < 10000; trial++) {
    const c1 = [rng() * 10 - 5, rng() * 10 - 5, rng() * 10 - 5]
    const c2 = [rng() * 10 - 5, rng() * 10 - 5, rng() * 10 - 5]
    const r1 = rng() * 3
    const r2 = rng() * 3
    const viaSqrt = Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]) <= r1 + r2
    assert.equal(circlesOverlap(c1, r1, c2, r2), viaSqrt)
    if (viaSqrt) hits++
  }
  assert.ok(hits > 500 && hits < 9500, `重なる組の数 ${hits} が偏りすぎている`)
})

test('組み合わせの数は N=100, 1000, 10000 で 4950, 499500, 49995000', () => {
  assert.equal(pairCount(100), 4950)
  assert.equal(pairCount(1000), 499500)
  assert.equal(pairCount(10000), 49995000)
})

test('組み合わせの数は、二重ループ(i < j)が作る組の数と一致する', () => {
  for (let n = 0; n < 50; n++) {
    let count = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) count++
    assert.equal(pairCount(n), count)
  }
})

// ---------------------------------------------------------------------------
// AABB と Sweep and Prune
// ---------------------------------------------------------------------------

// 整数座標の区間 [lo, hi](0 ≤ lo ≤ hi ≤ top)を全部並べる
function allIntervals(top) {
  const list = []
  for (let lo = 0; lo <= top; lo++) for (let hi = lo; hi <= top; hi++) list.push([lo, hi])
  return list
}

// 整数座標の箱どうしが整数の点を共有するか、点を 1 つずつ調べる遅い方法。
// 重なり部分も整数の端をもつ箱なので、重なっていれば必ず整数の共有点がある
function shareLatticePoint(a, b, top) {
  const dims = a.min.length
  const p = new Array(dims).fill(0)
  const visit = (k) => {
    if (k === dims) return true
    for (let x = 0; x <= top; x++) {
      p[k] = x
      const inA = a.min[k] <= x && x <= a.max[k]
      const inB = b.min[k] <= x && x <= b.max[k]
      if (inA && inB) {
        if (visit(k + 1)) return true
      }
    }
    return false
  }
  return visit(0)
}

function boxFrom(intervals) {
  return { min: intervals.map((i) => i[0]), max: intervals.map((i) => i[1]) }
}

test('整数座標の箱のすべての組(2 次元)で、整数の共有点を総当たりで探した結果と一致する', () => {
  const top = 3
  const intervals = allIntervals(top)
  const boxes = []
  for (const ix of intervals) for (const iy of intervals) boxes.push(boxFrom([ix, iy]))
  let overlapping = 0
  for (const a of boxes) {
    for (const b of boxes) {
      const expected = shareLatticePoint(a, b, top)
      assert.equal(aabbOverlap(a, b), expected)
      if (expected) overlapping++
    }
  }
  assert.ok(overlapping > 0 && overlapping < boxes.length ** 2)
})

test('整数座標の箱のすべての組(3 次元)で、整数の共有点を総当たりで探した結果と一致する', () => {
  const top = 2
  const intervals = allIntervals(top)
  const boxes = []
  for (const ix of intervals) for (const iy of intervals) for (const iz of intervals) boxes.push(boxFrom([ix, iy, iz]))
  for (const a of boxes) {
    for (const b of boxes) {
      assert.equal(aabbOverlap(a, b), shareLatticePoint(a, b, top))
    }
  }
})

test('x 軸では重なるが y 軸で離れている箱は重ならない', () => {
  const A = { min: [0, 0, 0], max: [2, 1, 1] }
  const B = { min: [1, 2, 0], max: [3, 3, 1] }
  assert.equal(aabbOverlap(A, B), false)
  assert.equal(aabbOverlap(B, A), false)
  assert.equal(aabbOverlap({ min: [0, 0], max: [2, 2] }, { min: [1, 1], max: [3, 3] }), true)
  assert.equal(aabbOverlap({ min: [0, 0], max: [2, 2] }, { min: [1, 2.5], max: [3, 4] }), false)
})

test('端が同じ座標で接する箱は重なる扱いで、判定は箱の順序によらない', () => {
  const A = { min: [0, 0], max: [1, 1] }
  const B = { min: [1, 0], max: [2, 1] }
  assert.equal(aabbOverlap(A, B), true)
  assert.equal(aabbOverlap(B, A), true)
  assert.equal(aabbOverlap({ min: [0, 0], max: [1, 1] }, { min: [1.0001, 0], max: [2, 1] }), false)
})

test('円を囲む箱が重ならなければ円も重ならない。箱は重なるのに円は離れている組もある', () => {
  const rng = makeRng(5)
  let boxOnly = 0
  for (let trial = 0; trial < 5000; trial++) {
    const c1 = [rng() * 6, rng() * 6]
    const c2 = [rng() * 6, rng() * 6]
    const r1 = 0.2 + rng()
    const r2 = 0.2 + rng()
    const boxes = aabbOverlap(circleBox(c1, r1), circleBox(c2, r2))
    const circles = circlesOverlap(c1, r1, c2, r2)
    if (circles) assert.ok(boxes)
    if (boxes && !circles) boxOnly++
  }
  assert.ok(boxOnly > 0)
  // 半径 1 の円が (0,0) と (1.5,1.5): 箱は [0.5,1]² で重なるが、中心の距離 2.12 は 2 より大きい
  assert.equal(aabbOverlap(circleBox([0, 0], 1), circleBox([1.5, 1.5], 1)), true)
  assert.equal(circlesOverlap([0, 0], 1, [1.5, 1.5], 1), false)
})

test('circleBox は out に書き込んで、新しい配列を作らない', () => {
  const out = { min: [9, 9], max: [9, 9] }
  const result = circleBox([1, 2], 0.5, out)
  assert.equal(result, out)
  assert.deepEqual(out, { min: [0.5, 1.5], max: [1.5, 2.5] })
})

function randomBoxes(rng, n, dims, span, maxSize) {
  return Array.from({ length: n }, () => {
    const min = Array.from({ length: dims }, () => rng() * span)
    const max = min.map((x) => x + rng() * maxSize)
    return { min, max }
  })
}

function bruteForcePairs(boxes) {
  const pairs = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (aabbOverlap(boxes[i], boxes[j])) pairs.push([i, j])
    }
  }
  return pairs
}

test('Sweep and Prune は、種を固定した乱数の箱で総当たりと同じ組を返す(2 次元)', () => {
  const rng = makeRng(21)
  let total = 0
  for (let trial = 0; trial < 30; trial++) {
    const boxes = randomBoxes(rng, 80, 2, 20, 2.5)
    const expected = bruteForcePairs(boxes)
    assert.deepEqual(sortPairs(sweepAndPrune(boxes)), expected)
    total += expected.length
  }
  assert.ok(total > 100, `重なる組が少なすぎる(${total})`)
})

test('Sweep and Prune は、3 次元の箱でも総当たりと同じ組を返す', () => {
  const rng = makeRng(22)
  let total = 0
  for (let trial = 0; trial < 20; trial++) {
    const boxes = randomBoxes(rng, 60, 3, 12, 3)
    const expected = bruteForcePairs(boxes)
    assert.deepEqual(sortPairs(sweepAndPrune(boxes)), expected)
    total += expected.length
  }
  assert.ok(total > 50, `重なる組が少なすぎる(${total})`)
})

test('Sweep and Prune は、端が同じ座標の箱・大きさ 0 の箱・入れ子の箱が多くても総当たりと一致する', () => {
  const rng = makeRng(23)
  for (let trial = 0; trial < 200; trial++) {
    const boxes = Array.from({ length: 25 }, () => {
      const x0 = Math.floor(rng() * 6)
      const y0 = Math.floor(rng() * 6)
      return { min: [x0, y0], max: [x0 + Math.floor(rng() * 3), y0 + Math.floor(rng() * 3)] }
    })
    assert.deepEqual(sortPairs(sweepAndPrune(boxes)), bruteForcePairs(boxes))
  }
})

test('Sweep and Prune は、箱が 0 個・1 個でも動き、組を (小さい番号, 大きい番号) で返す', () => {
  assert.deepEqual(sweepAndPrune([]), [])
  assert.deepEqual(sweepAndPrune([{ min: [0, 0], max: [1, 1] }]), [])
  // 配列の先頭より後ろの箱のほうが x の最小値が小さい並び
  const boxes = [
    { min: [5, 0], max: [8, 1] },
    { min: [0, 0], max: [6, 1] },
  ]
  assert.deepEqual(sweepAndPrune(boxes), [[0, 1]])
})

test('離れた箱が多いと Sweep and Prune の候補は N(N-1)/2 よりずっと少ない', () => {
  const rng = makeRng(24)
  const boxes = randomBoxes(rng, 300, 2, 200, 1.5)
  const pairs = sweepAndPrune(boxes)
  assert.ok(pairs.length < pairCount(300) / 100)
  assert.deepEqual(sortPairs(pairs), bruteForcePairs(boxes))
})

// ---------------------------------------------------------------------------
// サポート写像と GJK
// ---------------------------------------------------------------------------

const square = (x, y, s = 1) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
]

test('サポート写像は方向 d にいちばん遠い頂点を返す', () => {
  const sq = square(0, 0, 2)
  assert.deepEqual(support(sq, [1, 1]), [2, 2])
  assert.deepEqual(support(sq, [-1, 0.5]), [0, 2])
  assert.deepEqual(support(sq, [0.1, -1]), [2, 0])
  assert.deepEqual(support([[3, 4]], [-1, -1]), [3, 4])
})

test('差の集合 A ⊕ (-B) のサポート写像 s_A(d) - s_B(-d) は、差を全部作って d 方向の最大を取った値と一致する', () => {
  const rng = makeRng(2)
  for (let trial = 0; trial < 300; trial++) {
    const A = Array.from({ length: 7 }, () => [rng() * 6 - 3, rng() * 6 - 3])
    const B = Array.from({ length: 7 }, () => [rng() * 6 - 3, rng() * 6 - 3])
    const d = [rng() * 2 - 1, rng() * 2 - 1]
    let best = -Infinity
    for (const a of A) for (const b of B) best = Math.max(best, dot([a[0] - b[0], a[1] - b[1]], d))
    near(dot(minkowskiSupport(A, B, d), d), best)
  }
})

test('ミンコフスキー差のサポート点は、A の頂点と B の頂点の差になっている', () => {
  const A = square(0, 0, 2)
  const B = square(1, 1, 1)
  // d=(1,0): A でいちばん右は x=2、B でいちばん左(-d の向き)は x=1 → 差の x は 1
  assert.equal(minkowskiSupport(A, B, [1, 0])[0], 1)
  const p = minkowskiSupport(A, B, [1, 1])
  assert.deepEqual(p, [2 - 1, 2 - 1])
  assert.ok(A.some((a) => B.some((b) => a[0] - b[0] === p[0] && a[1] - b[1] === p[1])))
})

// 分離軸判定(SAT)。凸多角形の頂点が反時計回りか時計回りに並んでいるとき、
// どちらかの辺の法線で射影が離れていれば離れている(接していれば重なる扱い)
function satIntersect(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const axis = [-(q[1] - p[1]), q[0] - p[0]]
      const projA = A.map((v) => dot(v, axis))
      const projB = B.map((v) => dot(v, axis))
      if (Math.max(...projA) < Math.min(...projB) || Math.max(...projB) < Math.min(...projA)) return false
    }
  }
  return true
}

// 楕円の上に角度の順に頂点を置くと凸多角形になる
function randomConvexPolygon(rng, cx, cy) {
  const k = 3 + Math.floor(rng() * 6)
  const angles = Array.from({ length: k }, () => rng() * 2 * Math.PI).sort((a, b) => a - b)
  const rx = 0.4 + rng() * 1.6
  const ry = 0.4 + rng() * 1.6
  const rot = rng() * 2 * Math.PI
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return angles.map((t) => {
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    return [cx + c * x - s * y, cy + s * x + c * y]
  })
}

test('GJK は、種を固定したランダムな凸多角形 3000 組で分離軸判定と一致する', () => {
  const rng = makeRng(3)
  let hits = 0
  for (let trial = 0; trial < 3000; trial++) {
    const A = randomConvexPolygon(rng, rng() * 6 - 3, rng() * 6 - 3)
    const B = randomConvexPolygon(rng, rng() * 6 - 3, rng() * 6 - 3)
    const expected = satIntersect(A, B)
    assert.equal(gjkIntersect(A, B), expected, `${trial} 組目`)
    if (expected) hits++
  }
  assert.ok(hits > 300 && hits < 2700, `重なる組の数 ${hits} が偏りすぎている`)
})

test('GJK は、軸に平行な正方形どうし 300 組で、中心間の距離による判定と一致する', () => {
  const rng = makeRng(4)
  let hits = 0
  for (let trial = 0; trial < 300; trial++) {
    const ca = [rng() * 4 - 2, rng() * 4 - 2]
    const cb = [rng() * 4 - 2, rng() * 4 - 2]
    const ra = 0.3 + rng() * 1.2
    const rb = 0.3 + rng() * 1.2
    const sq = (c, r) => [-1, 1].flatMap((dx) => [-1, 1].map((dy) => [c[0] + dx * r, c[1] + dy * r]))
    const expected = Math.abs(ca[0] - cb[0]) <= ra + rb && Math.abs(ca[1] - cb[1]) <= ra + rb
    assert.equal(gjkIntersect(sq(ca, ra), sq(cb, rb)), expected)
    if (expected) hits++
  }
  assert.ok(hits > 60 && hits < 240)
})

test('GJK: 重なり・離れている・包含・辺や頂点で接する場合', () => {
  assert.equal(gjkIntersect(square(0, 0), square(0.5, 0.5)), true)
  assert.equal(gjkIntersect(square(0, 0), square(1.5, 0)), false)
  assert.equal(gjkIntersect(square(0, 0), square(1, 0)), true) // 辺で接する
  assert.equal(gjkIntersect(square(0, 0), square(1, 1)), true) // 頂点で接する
  assert.equal(gjkIntersect(square(0, 0), square(1.0001, 0)), false)
  assert.equal(gjkIntersect(square(0, 0, 10), square(4, 4, 1)), true) // B が A の中
  assert.equal(gjkIntersect(square(4, 4, 1), square(0, 0, 10)), true) // A が B の中
  // 三角形どうし
  const T1 = [[0, 0], [4, 0], [0, 4]]
  const T2 = [[3, 3], [6, 3], [3, 6]]
  const T3 = [[2, 2], [6, 2], [2, 6]]
  assert.equal(gjkIntersect(T1, T2), false) // 斜めの辺 x+y=4 のすき間
  assert.equal(gjkIntersect(T1, T3), true) // (2,2) で辺に触れる
})

test('GJK: 点や線分(頂点が 1〜2 個)も扱える', () => {
  assert.equal(gjkIntersect([[0.5, 0.5]], square(0, 0)), true)
  assert.equal(gjkIntersect([[2, 2]], square(0, 0)), false)
  assert.equal(gjkIntersect([[0, 0]], [[0, 0]]), true)
  assert.equal(gjkIntersect([[0, 0]], [[1, 0]]), false)
  const horizontal = [[-1, 0], [1, 0]]
  const vertical = [[0, -1], [0, 1]]
  assert.equal(gjkIntersect(horizontal, vertical), true) // 十字に交わる
  assert.equal(gjkIntersect(horizontal, [[0, 1], [0, 3]]), false)
  assert.equal(gjkIntersect(horizontal, [[2, 0], [3, 0]]), false) // 同じ直線の上で離れている
  assert.equal(gjkIntersect(horizontal, [[1, 0], [3, 0]]), true) // 端がちょうど接する
})

// 整数座標の点集合で厳密に確かめる: 凸包どうしが交わる ⇔ 原点が差の点 {a - b} の凸包に入る。
// 原点が凸包に入るのは、点そのもの・2 点を結ぶ線分・3 点の三角形のどれかが原点を含むとき(カラテオドリの定理)
function originInHull(points) {
  const cr = (p, q) => p[0] * q[1] - p[1] * q[0]
  for (const p of points) if (p[0] === 0 && p[1] === 0) return true
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (cr(points[i], points[j]) === 0 && dot(points[i], points[j]) <= 0) return true
    }
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const p = points[i]
        const q = points[j]
        const r = points[k]
        const area = cr([q[0] - p[0], q[1] - p[1]], [r[0] - p[0], r[1] - p[1]])
        if (area === 0) continue
        const s1 = cr(p, q)
        const s2 = cr(q, r)
        const s3 = cr(r, p)
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return true
      }
    }
  }
  return false
}

test('GJK は、整数座標の点集合(重複・一直線・接する場合を含む)で、差の凸包が原点を含むかの厳密な判定と一致する', () => {
  const rng = makeRng(31)
  let hits = 0
  let touching = 0
  const trials = 4000
  for (let trial = 0; trial < trials; trial++) {
    const size = (max) => 1 + Math.floor(rng() * max)
    const A = Array.from({ length: size(5) }, () => [Math.floor(rng() * 5), Math.floor(rng() * 5)])
    const B = Array.from({ length: size(5) }, () => [Math.floor(rng() * 5), Math.floor(rng() * 5)])
    const diffs = A.flatMap((a) => B.map((b) => [a[0] - b[0], a[1] - b[1]]))
    const expected = originInHull(diffs)
    assert.equal(gjkIntersect(A, B), expected, `A=${JSON.stringify(A)} B=${JSON.stringify(B)}`)
    if (expected) hits++
    if (expected && diffs.some((d) => d[0] === 0 && d[1] === 0)) touching++
  }
  assert.ok(hits > 500 && hits < trials - 500, `重なる組の数 ${hits} が偏りすぎている`)
  assert.ok(touching > 100)
})

test('GJK の結果は、A と B を入れ替えても、頂点の並びを変えても変わらない', () => {
  const rng = makeRng(32)
  const shuffle = (list) => {
    const out = list.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  for (let trial = 0; trial < 500; trial++) {
    const A = randomConvexPolygon(rng, rng() * 4 - 2, rng() * 4 - 2)
    const B = randomConvexPolygon(rng, rng() * 4 - 2, rng() * 4 - 2)
    const result = gjkIntersect(A, B)
    assert.equal(gjkIntersect(B, A), result)
    assert.equal(gjkIntersect(shuffle(A), shuffle(B)), result)
  }
})

test('GJK は渡された頂点の配列を書き換えない', () => {
  const A = square(0, 0)
  const B = square(0.5, 0.5)
  const copyA = JSON.parse(JSON.stringify(A))
  const copyB = JSON.parse(JSON.stringify(B))
  gjkIntersect(A, B)
  assert.deepEqual(A, copyA)
  assert.deepEqual(B, copyB)
})

// 頂点が (±1,0)、(0,±1) の菱形
const diamond = (cx, cy) => [
  [cx + 1, cy],
  [cx, cy + 1],
  [cx - 1, cy],
  [cx, cy - 1],
]
const boxOf = (points) => ({
  min: [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
  max: [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
})

test('菱形 2 つ(中心 (0,0) と (1.5,1.5))は、AABB の [-1,1]² と [0.5,2.5]² が重なるのに、GJK では離れている', () => {
  const A = diamond(0, 0)
  const B = diamond(1.5, 1.5)
  assert.deepEqual(boxOf(A), { min: [-1, -1], max: [1, 1] })
  assert.deepEqual(boxOf(B), { min: [0.5, 0.5], max: [2.5, 2.5] })
  assert.equal(aabbOverlap(boxOf(A), boxOf(B)), true)
  assert.equal(gjkIntersect(A, B), false)
  // 菱形(半径 1 の L1 球)は中心の L1 距離が 2 以下で重なる
  assert.equal(gjkIntersect(A, diamond(1, 1)), true)
  assert.equal(gjkIntersect(A, diamond(1.01, 1)), false)
  assert.equal(gjkIntersect(A, diamond(1.99, 0)), true)
  assert.equal(gjkIntersect(A, diamond(2.01, 0)), false)
})

test('A=[0,2]², B=[1,3]², C=[1,3]×[2.5,4]: 軸ごとの区間で A と B は重なり、A と C は y 軸で離れている', () => {
  const A = { min: [0, 0], max: [2, 2] }
  const B = { min: [1, 1], max: [3, 3] }
  const C = { min: [1, 2.5], max: [3, 4] }
  assert.equal(aabbOverlap(A, B), true)
  assert.equal(aabbOverlap(A, C), false)
  assert.deepEqual(sortPairs(sweepAndPrune([A, B, C])), [[0, 1], [1, 2]])
})

test('x 軸の端点は A の端点の間に B の端点が入るが、y 軸で離れているので Sweep and Prune は組を返さない', () => {
  const boxes = [
    { min: [0, 0], max: [2, 1] },
    { min: [1, 5], max: [3, 6] },
  ]
  assert.deepEqual(sweepAndPrune(boxes), [])
  assert.equal(aabbOverlap({ min: [0], max: [2] }, { min: [1], max: [3] }), true) // x 軸だけなら重なる
})

test('A=[0,2]² と B=[1,3]² は差の集合 [-3,1]² が原点を含んで重なり、B=[3,5]×[0,2] は含まず離れている', () => {
  const A = square(0, 0, 2)
  assert.equal(gjkIntersect(A, square(1, 1, 2)), true)
  assert.equal(gjkIntersect(A, [[3, 0], [5, 0], [5, 2], [3, 2]]), false)
  // 差の集合 A ⊕ (-B) の端の点: x 方向の最大は 2 - 3 = -1(原点の手前で止まる)
  const edge = minkowskiSupport(A, [[3, 0], [5, 0], [5, 2], [3, 2]], [1, 0])
  assert.equal(edge[0], -1)
})

test('半径 1 の円 2 つの中心が 1.8 離れていると、めり込みは 0.2 で、ばね定数 1000 N/m のペナルティ力は 200 N', () => {
  const a = body(0, 0, 0, 0, 1)
  const b = body(1.8, 0, 0, 0, 1)
  assert.equal(circlesOverlap(a.c, a.r, b.c, b.r), true)
  const depth = separateCircles(a, b)
  near(depth, 0.2, 1e-12)
  near(1000 * depth, 200, 1e-9)
})

// ---------------------------------------------------------------------------
// 撃力
// ---------------------------------------------------------------------------

test('撃力: 運動量が保存され、法線方向の相対速度が -e 倍になり、接線方向は変わらない', () => {
  const rng = makeRng(41)
  for (let trial = 0; trial < 500; trial++) {
    const b1 = body(0, 0, rng() * 6 - 3, rng() * 6 - 3, 1, 0.5 + rng() * 4)
    const theta = rng() * 2 * Math.PI
    const b2 = body(1.8 * Math.cos(theta), 1.8 * Math.sin(theta), rng() * 6 - 3, rng() * 6 - 3, 1, 0.5 + rng() * 4)
    const n = [Math.cos(theta), Math.sin(theta)]
    const t = [-n[1], n[0]]
    const e = rng()
    const relBefore = [b1.v[0] - b2.v[0], b1.v[1] - b2.v[1]]
    const p0 = momentum(b1, b2)
    const j = resolveCircles(b1, b2, e)
    const relAfter = [b1.v[0] - b2.v[0], b1.v[1] - b2.v[1]]
    const p1 = momentum(b1, b2)
    near(p1[0], p0[0], 1e-10)
    near(p1[1], p0[1], 1e-10)
    near(dot(relAfter, t), dot(relBefore, t), 1e-10) // 接線方向の相対速度は変わらない
    if (dot(relBefore, n) > 0) {
      near(dot(relAfter, n), -e * dot(relBefore, n), 1e-10)
      assert.ok(j > 0)
    } else {
      assert.equal(j, 0) // 離れていく組は何もしない
      near(dot(relAfter, n), dot(relBefore, n), 0)
    }
  }
})

test('撃力: 同じ質量の正面衝突は e=1 で速度を入れ替え、e=0 で 2 つとも平均の速度になる', () => {
  const a = body(0, 0, 3, 0)
  const b = body(1.9, 0, -1, 0)
  resolveCircles(a, b, 1)
  assert.deepEqual([a.v[0], b.v[0]], [-1, 3])
  const c = body(0, 0, 3, 0)
  const d = body(1.9, 0, -1, 0)
  resolveCircles(c, d, 0)
  assert.deepEqual([c.v[0], d.v[0]], [1, 1])
})

test('撃力: e=1 ならエネルギーは変わらず、e<1 なら (1-e²)/2·μ·v_n² だけ減る(μ は換算質量)', () => {
  const rng = makeRng(42)
  for (let trial = 0; trial < 300; trial++) {
    const m1 = 0.5 + rng() * 4
    const m2 = 0.5 + rng() * 4
    const b1 = body(0, 0, 4 * rng() + 1, rng() * 4 - 2, 1, m1)
    const b2 = body(1.8, 0.3, -4 * rng() - 1, rng() * 4 - 2, 1, m2)
    const dist = Math.hypot(1.8, 0.3)
    const n = [1.8 / dist, 0.3 / dist]
    const vn = (b1.v[0] - b2.v[0]) * n[0] + (b1.v[1] - b2.v[1]) * n[1]
    const e = rng()
    const before = kinetic(b1, b2)
    resolveCircles(b1, b2, e)
    const mu = (m1 * m2) / (m1 + m2)
    near(before - kinetic(b1, b2), 0.5 * (1 - e * e) * mu * vn * vn, 1e-9)
  }
  const a = body(0, 0, 2, 1, 1, 3)
  const b = body(1.5, 0, -1, 0, 1, 2)
  const energy = kinetic(a, b)
  resolveCircles(a, b, 1)
  near(kinetic(a, b), energy, 1e-12)
})

test('撃力: 動かない物体(m=Infinity)との衝突は reflectVelocity と同じ結果で、動かない物体は動かない', () => {
  const rng = makeRng(43)
  for (let trial = 0; trial < 200; trial++) {
    const theta = rng() * 2 * Math.PI
    const n = [Math.cos(theta), Math.sin(theta)] // 1 から 2 へ
    const ball = body(0, 0, rng() * 6 - 3, rng() * 6 - 3, 1, 1 + rng())
    const wall = body(1.8 * n[0], 1.8 * n[1], 0, 0, 1, Infinity)
    const e = rng()
    const expected = dot(ball.v, n) > 0 ? reflectVelocity(ball.v, [-n[0], -n[1]], e) : ball.v.slice()
    resolveCircles(ball, wall, e)
    near(ball.v[0], expected[0], 1e-10)
    near(ball.v[1], expected[1], 1e-10)
    assert.deepEqual(wall.v, [0, 0])
  }
})

test('撃力: つかんで動かしている円(m=Infinity、速度あり)がぶつかると、つかんだ円の速度は変わらず、相手は相対速度が -e 倍になる', () => {
  const grabbed = body(0, 0, 4, 0, 1, Infinity) // マウスで +x 向きに速さ 4 で動かしている
  const other = body(1.8, 0, 1, 0.5, 1, 2)
  const e = 0.5
  resolveCircles(grabbed, other, e)
  assert.deepEqual(grabbed.v, [4, 0])
  // 相対速度の法線(x)成分: 3 → -e·3 = -1.5。つまり other の速度は 4 + 1.5 = 5.5
  near(other.v[0], 4 + e * 3, 1e-12)
  near(other.v[1], 0.5, 1e-12) // 接線(y)方向は変わらない
})

test('撃力: 中心が一致していても NaN にならず、両方とも動かない物体なら何もしない', () => {
  const a = body(1, 1, 2, 0)
  const b = body(1, 1, -2, 0)
  const j = resolveCircles(a, b, 0.5)
  assert.ok(Number.isFinite(j) && j > 0)
  assert.ok([...a.v, ...b.v].every(Number.isFinite))
  const w1 = body(0, 0, 0, 0, 1, Infinity)
  const w2 = body(1, 0, 0, 0, 1, Infinity)
  assert.equal(resolveCircles(w1, w2, 0.5), 0)
  assert.deepEqual([w1.v, w2.v], [[0, 0], [0, 0]])
})

test('めり込みの押し戻し: 距離がちょうど r1+r2 になり、質量の逆数に比例して動き、重心は変わらない', () => {
  const rng = makeRng(44)
  for (let trial = 0; trial < 200; trial++) {
    const m1 = 0.5 + rng() * 3
    const m2 = 0.5 + rng() * 3
    const a = body(0, 0, 0, 0, 1, m1)
    const phi = rng() * 2 * Math.PI
    const b = body(1.2 * Math.cos(phi), 1.2 * Math.sin(phi) + 0.2, 0, 0, 0.8, m2)
    const cx = (m1 * a.c[0] + m2 * b.c[0]) / (m1 + m2)
    const cy = (m1 * a.c[1] + m2 * b.c[1]) / (m1 + m2)
    const depth = 1.8 - Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1])
    assert.ok(depth > 0)
    near(separateCircles(a, b), depth, 1e-12)
    near(Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]), 1.8, 1e-12)
    near((m1 * a.c[0] + m2 * b.c[0]) / (m1 + m2), cx, 1e-12)
    near((m1 * a.c[1] + m2 * b.c[1]) / (m1 + m2), cy, 1e-12)
  }
})

test('めり込みの押し戻し: 重なっていなければ動かさず、動かない物体は動かない', () => {
  const a = body(0, 0, 0, 0, 1)
  const b = body(3, 0, 0, 0, 1)
  assert.equal(separateCircles(a, b), 0)
  assert.deepEqual([a.c, b.c], [[0, 0], [3, 0]])
  const ball = body(0, 0, 0, 0, 1, 2)
  const wall = body(1.5, 0, 0, 0, 1, Infinity)
  near(separateCircles(ball, wall), 0.5)
  assert.deepEqual(wall.c, [1.5, 0])
  near(ball.c[0], -0.5)
})

// ---------------------------------------------------------------------------
// 箱の中の円(剛体のシミュレーションと同じ組み立て)
// ---------------------------------------------------------------------------

// 重力 → 位置の更新 → 円どうし(Sweep and Prune → 円の判定 → 撃力 → 押し戻し) → 壁の順に 1 ステップ進める。
// 壁を最後にすると、押し戻しで円が箱の外に出ることがない。
// y は上向きが正で、重力は -y の向き。返り値は円どうしに撃力を与えた回数
function stepScene(bodies, { width, height, gravity, e, dt }) {
  // 壁の位置 at と、壁から円のある側へ向かう法線 n
  const walls = [
    { n: [1, 0], axis: 0, at: 0 },
    { n: [-1, 0], axis: 0, at: width },
    { n: [0, 1], axis: 1, at: 0 },
    { n: [0, -1], axis: 1, at: height },
  ]
  for (const b of bodies) {
    b.v[1] -= gravity * dt // 速度を先に更新して、
    b.c[0] += dt * b.v[0] // 新しい速度で位置を更新する
    b.c[1] += dt * b.v[1]
  }
  const boxes = bodies.map((b) => circleBox(b.c, b.r))
  let impulses = 0
  for (const [i, j] of sweepAndPrune(boxes)) {
    const a = bodies[i]
    const b = bodies[j]
    if (!circlesOverlap(a.c, a.r, b.c, b.r)) continue
    if (resolveCircles(a, b, e) > 0) impulses++
    separateCircles(a, b)
  }
  for (const b of bodies) {
    for (const { n, axis, at } of walls) {
      const dist = (b.c[axis] - at) * n[axis] // 壁から中心までの距離
      if (dist < b.r) {
        b.c[axis] += (b.r - dist) * n[axis]
        if (b.v[0] * n[0] + b.v[1] * n[1] < 0) reflectVelocity(b.v, n, e, b.v)
      }
    }
  }
  return impulses
}

function makeScene(rng, count, width, height, radius, speed) {
  const bodies = []
  const cols = Math.ceil(Math.sqrt(count))
  for (let k = 0; k < count; k++) {
    const x = ((k % cols) + 0.5) * (width / cols)
    const y = (Math.floor(k / cols) + 0.5) * (height / cols)
    bodies.push({ c: [x, y], v: [(rng() - 0.5) * speed, (rng() - 0.5) * speed], r: radius, m: 1 + rng() })
  }
  return bodies
}

test('箱の中の円: 重力なし・e=1 で 3000 ステップ進めても運動エネルギーがほぼ変わらず、円は箱から出ない', () => {
  const rng = makeRng(51)
  const width = 10
  const height = 8
  const bodies = makeScene(rng, 16, width, height, 0.4, 6)
  const energy = kinetic(...bodies)
  let impulses = 0
  for (let step = 0; step < 3000; step++) {
    impulses += stepScene(bodies, { width, height, gravity: 0, e: 1, dt: 0.005 })
  }
  assert.ok(impulses > 20, `円どうしの衝突が少なすぎる(${impulses})`)
  near(kinetic(...bodies) / energy, 1, 1e-9)
  for (const b of bodies) {
    assert.ok(b.c[0] >= b.r - 1e-9 && b.c[0] <= width - b.r + 1e-9)
    assert.ok(b.c[1] >= b.r - 1e-9 && b.c[1] <= height - b.r + 1e-9)
  }
})

test('箱の中の円: 重力と e=0.5 でも 4000 ステップで発散せず、円は下にたまってほぼ止まり、箱から出ない', () => {
  const rng = makeRng(52)
  const width = 8
  const height = 8
  const bodies = makeScene(rng, 20, width, height, 0.4, 4)
  const params = { width, height, gravity: 9.8, e: 0.5, dt: 0.004 }
  let peak = 0
  for (let step = 0; step < 4000; step++) {
    stepScene(bodies, params)
    peak = Math.max(peak, ...bodies.map((b) => Math.hypot(b.v[0], b.v[1])))
  }
  assert.ok(peak < 15, `速さが大きくなりすぎた(${peak})`)
  for (const b of bodies) {
    assert.ok(Number.isFinite(b.c[0]) && Number.isFinite(b.c[1]))
    assert.ok(b.c[0] >= b.r - 1e-9 && b.c[0] <= width - b.r + 1e-9)
    assert.ok(b.c[1] >= b.r - 1e-9 && b.c[1] <= height - b.r + 1e-9)
  }
  // 4000 ステップ(16 秒)後は、円が下にたまってほとんど止まっている(速さ 0.5 未満)
  const slow = bodies.filter((b) => Math.hypot(b.v[0], b.v[1]) < 0.5).length
  assert.equal(slow, 20)
  assert.ok(bodies.every((b) => b.c[1] < 4), '上に浮いている円がある')
})
