import test from 'node:test'
import assert from 'node:assert/strict'
import {
  lerpPoint,
  deCasteljau,
  binomial,
  bernstein,
  bezierPoint,
  bezierDerivative,
  uniformKnots,
  bsplineBasis,
  bsplinePoint,
  bsplineDerivative,
  chaikinStep,
  chaikin,
  curvature2D,
  frame2D,
  ellipsePoint,
  ellipseImplicit,
  hyperbolaPoint,
  hyperbolaImplicit,
  cross,
  bezierPatch,
} from '../../src/utils/vis/curve.js'

function assertClose(actual, expected, tolerance = 1e-12, label = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} と ${expected} の差が ${tolerance} を超えた`)
}

function assertPointClose(actual, expected, tolerance = 1e-12, label = '') {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, i) => assertClose(value, expected[i], tolerance, `${label}[${i}]`))
}

const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]))

test('線形補間とド・カステリョは、バーンスタイン基底の和と一致する', () => {
  assert.deepEqual(lerpPoint([1, 2], [5, 10], 0.25), [2, 4])
  const points = [[-1, 2], [0, 4], [3, -2], [5, 1], [7, 3]]
  for (const t of [0, 0.01, 0.2, 0.5, 0.93, 1]) {
    const casteljau = deCasteljau(points, t)
    assert.deepEqual(casteljau.levels[0], points)
    assert.equal(casteljau.levels.length, points.length)
    assertPointClose(casteljau.point, bezierPoint(points, t), 1e-12, `t=${t}`)
  }
})

test('バーンスタイン基底は 0 以上で、n=1..8 のどの t でも和が 1', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => binomial(5, i)), [1, 5, 10, 10, 5, 1])
  for (let n = 1; n <= 8; n++) {
    for (let sample = 0; sample <= 40; sample++) {
      const t = sample / 40
      const weights = Array.from({ length: n + 1 }, (_, i) => bernstein(n, i, t))
      assert.ok(weights.every((weight) => weight >= 0))
      assertClose(weights.reduce((sum, weight) => sum + weight, 0), 1, 1e-12, `n=${n}, t=${t}`)
    }
  }
})

test('ベジエ曲線は端の制御点を通り、端の接線は n(P1-P0)', () => {
  const points = [[1, 2], [3, 5], [7, -1], [9, 4]]
  assertPointClose(bezierPoint(points, 0), points[0])
  assertPointClose(bezierPoint(points, 1), points.at(-1))
  assertPointClose(bezierDerivative(points, 0), [6, 9])
  assertPointClose(bezierDerivative(points, 1), [6, 15])
})

test('ベジエの 1 階・2 階導関数は中心差分と一致する', () => {
  const points = [[0, 1], [2, 4], [4, -2], [7, 3], [8, 1]]
  const h = 1e-4
  for (const t of [0.2, 0.47, 0.8]) {
    const before = bezierPoint(points, t - h)
    const center = bezierPoint(points, t)
    const after = bezierPoint(points, t + h)
    const first = before.map((value, i) => (after[i] - value) / (2 * h))
    const second = before.map((value, i) => (after[i] - 2 * center[i] + value) / h ** 2)
    assertPointClose(bezierDerivative(points, t, 1), first, 1e-6, `1階 t=${t}`)
    assertPointClose(bezierDerivative(points, t, 2), second, 1e-6, `2階 t=${t}`)
  }
})

test('ベジエ曲線は制御点の凸包から出ない', () => {
  const triangle = [[0, 0], [2, 0], [0, 2]]
  for (let sample = 0; sample <= 100; sample++) {
    const [x, y] = bezierPoint(triangle, sample / 100)
    assert.ok(x >= -1e-12 && y >= -1e-12 && x + y <= 2 + 1e-12)
  }
})

test('一様 B スプライン基底は定義域で和が 1、台の外で 0', () => {
  const count = 7
  const degree = 3
  const knots = uniformKnots(count, degree)
  assert.deepEqual(knots, [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7])
  for (let sample = 0; sample <= 80; sample++) {
    const t = (sample / 80) * (count - degree)
    const sum = Array.from({ length: count }, (_, i) => bsplineBasis(i, degree, t, knots))
      .reduce((total, value) => total + value, 0)
    assertClose(sum, 1, 1e-12, `t=${t}`)
  }
  for (let i = 0; i < count; i++) {
    assert.equal(bsplineBasis(i, degree, knots[i] - 0.1, knots), 0)
    assert.equal(bsplineBasis(i, degree, knots[i + degree + 1] + 0.1, knots), 0)
  }
})

test('一様 3 次 B スプラインの 1 区間は 1/6 の行列係数と一致する', () => {
  const points = [[0, 1], [1, 3], [3, -1], [5, 2], [6, 0], [8, 1], [9, 2]]
  const knots = uniformKnots(points.length, 3)
  for (const t of [0, 0.1, 0.35, 0.7, 1]) {
    const weights = [
      (1 - t) ** 3,
      3 * t ** 3 - 6 * t ** 2 + 4,
      -3 * t ** 3 + 3 * t ** 2 + 3 * t + 1,
      t ** 3,
    ].map((value) => value / 6)
    const expected = [0, 1].map((_, axis) =>
      weights.reduce((sum, weight, i) => sum + weight * points[i][axis], 0),
    )
    assertPointClose(bsplinePoint(points, 3, knots, t), expected, 1e-12, `t=${t}`)
  }
})

test('B スプラインは局所性を持ち、つなぎ目で 2 階微分まで連続する', () => {
  const points = [[0, 0], [1, 0.4], [2, -0.2], [3, 0.8], [4, 0.1], [5, 0.7], [6, 0]]
  const moved = points.map((point) => point.slice())
  moved[2] = [2, 3]
  const knots = uniformKnots(points.length, 3)
  for (const t of [3, 3.25, 3.75, 4]) {
    assertPointClose(bsplinePoint(points, 3, knots, t), bsplinePoint(moved, 3, knots, t), 1e-12, `局所性 t=${t}`)
  }
  const epsilon = 1e-7
  for (const knot of [1, 2, 3]) {
    for (const order of [0, 1, 2]) {
      const evaluate = order === 0
        ? (t) => bsplinePoint(points, 3, knots, t)
        : (t) => bsplineDerivative(points, 3, knots, t, order)
      assertPointClose(evaluate(knot - epsilon), evaluate(knot + epsilon), 2e-5, `t=${knot}, ${order}階`)
    }
  }
})

test('Chaikin は n 点を 2(n-1) 点にし、反復すると 2 次一様 B スプラインへ近づく', () => {
  const points = [[0, 0.2], [0.2, 0.5], [0.4, 0.15], [0.6, 0.55], [0.8, 0.25], [1, 0.45]]
  assert.equal(chaikinStep(points).length, 2 * (points.length - 1))
  const knots = uniformKnots(points.length, 2)
  const curve = Array.from({ length: 10001 }, (_, i) =>
    bsplinePoint(points, 2, knots, (i / 10000) * (points.length - 2)),
  )
  const maxDistance = (level) => Math.max(...chaikin(points, level).map((point) =>
    Math.min(...curve.map((sample) => distance(point, sample))),
  ))
  const errors = [1, 2, 4, 8].map(maxDistance)
  assert.ok(errors.every((error, i) => i === 0 || error < errors[i - 1]))
  assert.ok(errors.at(-1) < 1e-3, `8 回後の最大距離 ${errors.at(-1)}`)
})

test('曲率は半径 r の円で 1/r、直線で 0、向きを逆にすると符号が逆', () => {
  const r = 3.5
  const t = 0.7
  const d1 = [-r * Math.sin(t), r * Math.cos(t)]
  const d2 = [-r * Math.cos(t), -r * Math.sin(t)]
  assertClose(curvature2D(d1, d2), 1 / r)
  assertClose(curvature2D(d1.map((value) => -value), d2), -1 / r)
  assert.equal(curvature2D([2, 1], [0, 0]), 0)
  const { tangent, normal } = frame2D([3, 4])
  assertPointClose(tangent, [0.6, 0.8])
  assertPointClose(normal, [-0.8, 0.6])
  assertClose(tangent[0] * normal[0] + tangent[1] * normal[1], 0)
})

test('楕円と双曲線の媒介変数の点は陰関数を 0 にする', () => {
  for (const t of [-2, -0.4, 0, 0.8, 2.5]) {
    const ellipse = ellipsePoint(3, 1.5, t)
    const hyperbola = hyperbolaPoint(2, 0.7, t)
    assertClose(ellipseImplicit(3, 1.5, ...ellipse), 0, 1e-12, `楕円 t=${t}`)
    assertClose(hyperbolaImplicit(2, 0.7, ...hyperbola), 0, 1e-11, `双曲線 t=${t}`)
  }
})

test('双 3 次ベジエ曲面は四隅を通り、法線は接線に直交する', () => {
  const patch = Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => [i, Math.sin(i + j) * 0.2, j]),
  )
  for (const [u, v, expected] of [
    [0, 0, patch[0][0]],
    [0, 1, patch[0][3]],
    [1, 0, patch[3][0]],
    [1, 1, patch[3][3]],
  ]) assertPointClose(bezierPatch(patch, u, v).point, expected, 1e-12)

  const { du, dv, normal } = bezierPatch(patch, 0.37, 0.62)
  assertClose(du.reduce((sum, value, i) => sum + value * normal[i], 0), 0, 1e-12)
  assertClose(dv.reduce((sum, value, i) => sum + value * normal[i], 0), 0, 1e-12)
  assertPointClose(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1])

  const flat = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => [i, 2, j]))
  const flatNormal = bezierPatch(flat, 0.4, 0.6).normal
  assertClose(Math.abs(flatNormal[1]), 1, 1e-12)
  assertClose(flatNormal[0], 0, 1e-12)
  assertClose(flatNormal[2], 0, 1e-12)
})
