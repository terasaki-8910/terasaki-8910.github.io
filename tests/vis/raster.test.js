import test from 'node:test'
import assert from 'node:assert/strict'
import { isBackFace, depthSpan, zTest } from '../../src/utils/vis/raster.js'
import { perspectiveMatrix, toNDC } from '../../src/utils/vis/projection.js'
import { compose, rotateX, rotateY, translate, transformPoint } from '../../src/utils/vis/mat4.js'

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const sub = (a, b) => a.map((x, i) => x - b[i])
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const FOVY = Math.PI / 3
const ASPECT = 16 / 9
const NEAR = 0.1
const FAR = 100
const P = perspectiveMatrix(FOVY, ASPECT, NEAR, FAR)
const ndcOf = (p) => toNDC(transformPoint(P, [...p, 1]))

// 3次元の判定(法線 N = (b-a)×(c-a)、面上の点 a から視点(原点)へのベクトル V)
function isBackFace3D(a, b, c) {
  const N = cross(sub(b, a), sub(c, a))
  const V = a.map((x) => -x)
  return dot(N, V) < 0
}

test('反時計回りに並ぶ三角形は表、時計回りは背面、一直線に並ぶ(面積 0)ものは背面にしない', () => {
  const [a, b, c] = [
    [0, 0],
    [1, 0],
    [0, 1],
  ]
  assert.equal(isBackFace(a, b, c), false)
  assert.equal(isBackFace(a, c, b), true)
  assert.equal(isBackFace([0, 0], [1, 1], [2, 2]), false)
})

test('頂点の並びを巡回させても向きは同じで、2つ入れ替えると向きが逆になる', () => {
  const rng = makeRng(20)
  for (let n = 0; n < 100; n++) {
    const [a, b, c] = [0, 1, 2].map(() => [rng() * 2 - 1, rng() * 2 - 1])
    const back = isBackFace(a, b, c)
    assert.equal(isBackFace(b, c, a), back)
    assert.equal(isBackFace(c, a, b), back)
    assert.equal(isBackFace(a, c, b), !back)
  }
})

test('画面上の符号付き面積による判定は、3次元の法線と視点への向きの内積 N·V < 0 と一致する(乱数 2000 枚)', () => {
  const rng = makeRng(21)
  let backs = 0
  let fronts = 0
  for (let n = 0; n < 2000; n++) {
    // 視点(原点)から見て -z の側(カメラの前)にある三角形
    const tri = Array.from({ length: 3 }, () => [rng() * 8 - 4, rng() * 8 - 4, -(rng() * 15 + 1)])
    const [a, b, c] = tri
    const N = cross(sub(b, a), sub(c, a))
    const cosTheta = dot(N, a.map((x) => -x)) / Math.hypot(...N) / Math.hypot(...a)
    if (Math.abs(cosTheta) < 1e-6) continue // 真横から見た面は符号が不安定
    const [pa, pb, pc] = tri.map((p) => ndcOf(p).slice(0, 2))
    const back = isBackFace(pa, pb, pc)
    assert.equal(back, cosTheta < 0)
    assert.equal(back, isBackFace3D(a, b, c))
    if (back) backs++
    else fronts++
  }
  assert.ok(backs > 500 && fronts > 500, `backs=${backs} fronts=${fronts}`)
})

// 外向きの法線になる向き(外から見て反時計回り)で並べた立方体の6面
const CUBE_FACES = [
  [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], // +x
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // -x
  [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], // +y
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // -y
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], // +z
  [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], // -z
]

test('閉じた立方体の 12 枚の三角形のうち、見る向きによらず約半分(この向きでは 6 枚)が背面として捨てられる', () => {
  const M = compose(translate(0.3, 0.2, -6), rotateY(0.6), rotateX(0.5))
  let culled = 0
  for (const [a, b, c, d] of CUBE_FACES) {
    for (const tri of [
      [a, b, c],
      [a, c, d],
    ]) {
      const eye = tri.map((p) => transformPoint(M, [...p, 1]).slice(0, 3))
      const screen = eye.map((p) => ndcOf(p).slice(0, 2))
      const back = isBackFace(...screen)
      assert.equal(back, isBackFace3D(...eye))
      if (back) culled++
    }
  }
  assert.equal(culled, 6)
})

test('depthSpan: 左端から右端まで n 画素。Δz を足していくので端点を含み、等間隔になる', () => {
  assert.deepEqual(Array.from(depthSpan(0, 1, 5)), [0, 0.25, 0.5, 0.75, 1])
  assert.deepEqual(Array.from(depthSpan(1, -1, 3)), [1, 0, -1]) // 手前→奥の向きでなくてもよい
  assert.deepEqual(Array.from(depthSpan(0.3, 0.9, 1)), [0.3])
  assert.deepEqual(Array.from(depthSpan(0.3, 0.9, 0)), [])
})

test('depthSpan: Δz を足していった値が、直接の線形補間と 1e-12 以内で一致する(n=2〜2000)', () => {
  const rng = makeRng(22)
  for (const n of [2, 3, 10, 100, 640, 2000]) {
    const z0 = rng() * 2 - 1
    const z1 = rng() * 2 - 1
    const z = depthSpan(z0, z1, n)
    let maxErr = 0
    for (let i = 0; i < n; i++) {
      const direct = z0 + ((z1 - z0) * i) / (n - 1)
      maxErr = Math.max(maxErr, Math.abs(z[i] - direct))
    }
    assert.ok(maxErr < 1e-12, `n=${n} maxErr=${maxErr}`)
  }
})

// 平面 N·X = N·p0 と、画面(NDC)の点を通る視線の交点。視線は eye 座標で z=-1 の面を通る
function depthOnPlane(plane, sx, sy) {
  const t = Math.tan(FOVY / 2)
  const dir = [sx * ASPECT * t, sy * t, -1]
  const s = dot(plane.N, plane.p0) / dot(plane.N, dir)
  const X = dir.map((x) => x * s)
  return { zEye: X[2], zNdc: ndcOf(X)[2], s, denom: dot(plane.N, dir) }
}

test('平面のポリゴンでは、画面上の線分に沿って z_ndc と 1/z は1次式で、Δz を足すだけで各画素の深度になる', () => {
  const rng = makeRng(23)
  let accepted = 0
  let maxErrNdc = 0
  let maxErrInv = 0
  let maxGap = 0
  for (let k = 0; k < 200 && accepted < 60; k++) {
    const plane = {
      p0: [rng() * 2 - 1, rng() * 2 - 1, -(rng() * 8 + 2)],
      N: [rng() * 2 - 1, rng() * 2 - 1, rng() * 0.8 + 0.4],
    }
    // 画面(NDC)の線分: 走査線(水平)や辺(斜め)を含む
    const [xa, ya, xb, yb] = [0, 1, 2, 3].map(() => rng() * 1.6 - 0.8)
    const n = 64
    const px = Array.from({ length: n }, (_, i) => [xa + ((xb - xa) * i) / (n - 1), ya + ((yb - ya) * i) / (n - 1)])
    const hits = px.map(([sx, sy]) => depthOnPlane(plane, sx, sy))
    if (hits.some((h) => h.s <= 0 || h.zEye > -0.5 || Math.abs(h.denom) < 0.05)) continue
    accepted++
    const ndc = depthSpan(hits[0].zNdc, hits[n - 1].zNdc, n)
    const inv = depthSpan(1 / hits[0].zEye, 1 / hits[n - 1].zEye, n)
    const eye = depthSpan(hits[0].zEye, hits[n - 1].zEye, n)
    hits.forEach((h, i) => {
      maxErrNdc = Math.max(maxErrNdc, Math.abs(ndc[i] - h.zNdc))
      maxErrInv = Math.max(maxErrInv, Math.abs(inv[i] - 1 / h.zEye))
      maxGap = Math.max(maxGap, Math.abs(eye[i] - h.zEye))
    })
  }
  assert.ok(accepted >= 30, `accepted=${accepted}`)
  assert.ok(maxErrNdc < 1e-11, `z_ndc の誤差 ${maxErrNdc}`)
  assert.ok(maxErrInv < 1e-11, `1/z の誤差 ${maxErrInv}`)
  // カメラ座標の z を同じように足していくと、画素の途中で大きくずれる
  assert.ok(maxGap > 1e-2, `カメラ座標の z のずれ ${maxGap}`)
})

test('走査線の例: 傾いた平面の z_ndc は一画素ごとに同じ Δz だけ増える', () => {
  const plane = { p0: [0.2, 0.1, -4], N: [0.3, 0.2, 1] }
  const n = 32
  const sy = 0.1
  const z = Array.from({ length: n }, (_, i) => depthOnPlane(plane, -0.5 + (1.0 * i) / (n - 1), sy).zNdc)
  const steps = z.slice(1).map((v, i) => v - z[i])
  const dz = (z[n - 1] - z[0]) / (n - 1)
  steps.forEach((s) => assert.ok(Math.abs(s - dz) < 1e-12))
  assert.ok(Math.abs(dz) > 1e-4)
})

test('zTest: 手前なら書いて true、奥または同じ深度なら書かずに false', () => {
  const buffer = new Float64Array(4).fill(Infinity)
  assert.equal(zTest(buffer, 0, 0.5), true)
  assert.equal(buffer[0], 0.5)
  assert.equal(zTest(buffer, 0, 0.7), false) // 奥
  assert.equal(buffer[0], 0.5)
  assert.equal(zTest(buffer, 0, 0.5), false) // 同じ深度は先に書いたほうを残す
  assert.equal(zTest(buffer, 0, 0.2), true) // 手前
  assert.equal(buffer[0], 0.2)
  assert.equal(zTest(buffer, 0, NaN), false)
  assert.equal(buffer[0], 0.2)
  assert.equal(buffer[1], Infinity) // ほかの画素は変わらない
})

test('z バッファは描く順番によらず、画素ごとに一番手前の断片を残す(乱数 400 断片を 3 通りの順で)', () => {
  const rng = makeRng(24)
  const size = 30
  const fragments = Array.from({ length: 400 }, (_, id) => ({
    id,
    pixel: Math.floor(rng() * size),
    z: rng() * 2 - 1,
  }))
  // 正解: 画素ごとの最小の深度とその断片
  const best = new Map()
  for (const f of fragments) if (!best.has(f.pixel) || f.z < best.get(f.pixel).z) best.set(f.pixel, f)

  const results = [0, 1, 2].map((trial) => {
    const order = fragments.slice()
    if (trial === 1) order.reverse()
    if (trial === 2) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
    }
    const depth = new Float64Array(size).fill(Infinity)
    const owner = new Array(size).fill(-1)
    for (const f of order) if (zTest(depth, f.pixel, f.z)) owner[f.pixel] = f.id
    return { depth, owner }
  })
  for (const { depth, owner } of results) {
    for (let p = 0; p < size; p++) {
      if (best.has(p)) {
        assert.equal(depth[p], best.get(p).z)
        assert.equal(owner[p], best.get(p).id)
      } else {
        assert.equal(depth[p], Infinity)
      }
    }
  }
})

test('交差する2枚の面を depthSpan と zTest で描くと、交点の左右で手前の面が入れ替わる', () => {
  const n = 21
  // 面 A は深度 0.2 → 0.8 (画素 0〜20)、面 B は 0.8 → 0.2 (同じ画素)。交点は真ん中の画素 10
  const A = depthSpan(0.2, 0.8, n)
  const B = depthSpan(0.8, 0.2, n)
  const depth = new Float64Array(n).fill(Infinity)
  const owner = new Array(n).fill('')
  for (let i = 0; i < n; i++) if (zTest(depth, i, A[i])) owner[i] = 'A'
  for (let i = 0; i < n; i++) if (zTest(depth, i, B[i])) owner[i] = 'B'
  for (let i = 0; i < 10; i++) assert.equal(owner[i], 'A') // 左半分は A が手前
  for (let i = 11; i < n; i++) assert.equal(owner[i], 'B')
  assert.ok(Math.abs(depth[10] - 0.5) < 1e-12) // 交点の深度
  depth.forEach((d, i) => assert.ok(Math.abs(d - Math.min(A[i], B[i])) < 1e-15))
})
