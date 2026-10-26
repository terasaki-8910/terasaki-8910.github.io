// 曲線と曲面の計算。点は成分数を固定せず、配列の各成分を同じ式で計算する。

const zeroPoint = (dimension) => new Array(dimension).fill(0)

const scalePoint = (point, scale) => point.map((value) => value * scale)

const addPoint = (a, b) => a.map((value, i) => value + b[i])

const subtractPoint = (a, b) => a.map((value, i) => value - b[i])

const length = (point) => Math.hypot(...point)

// @snippet curve-lerpPoint
// 2 点を (1-t):t に内分する。各座標に同じ線形補間を使う。
export function lerpPoint(a, b, t) {
  return a.map((value, i) => (1 - t) * value + t * b[i])
}
// @end

// @snippet curve-deCasteljau
// 隣り合う点を同じ t で内分し、1 点になるまで繰り返す。
export function deCasteljau(points, t) {
  const levels = [points.map((point) => point.slice())]
  while (levels.at(-1).length > 1) {
    const previous = levels.at(-1)
    levels.push(previous.slice(0, -1).map((point, i) => lerpPoint(point, previous[i + 1], t)))
  }
  return { point: levels.at(-1)[0]?.slice() ?? [], levels }
}
// @end

// @snippet curve-binomial
// 二項係数 nCi。階乗を作らず、対称性を使った積で求める。
export function binomial(n, i) {
  if (!Number.isInteger(n) || !Number.isInteger(i) || n < 0 || i < 0 || i > n) return 0
  const k = Math.min(i, n - i)
  let value = 1
  for (let j = 1; j <= k; j++) value = (value * (n - k + j)) / j
  return value
}
// @end

// @snippet curve-bernstein
// n 次バーンスタイン基底 B_i^n(t) = nCi t^i (1-t)^(n-i)。
export function bernstein(n, i, t) {
  if (!Number.isInteger(n) || !Number.isInteger(i) || n < 0 || i < 0 || i > n) return 0
  return binomial(n, i) * t ** i * (1 - t) ** (n - i)
}
// @end

// @snippet curve-bezierPoint
// 制御点にバーンスタイン基底の重みを掛けて足し、ベジエ曲線上の点を求める。
export function bezierPoint(points, t) {
  if (points.length === 0) return []
  const n = points.length - 1
  return points.reduce(
    (sum, point, i) => addPoint(sum, scalePoint(point, bernstein(n, i, t))),
    zeroPoint(points[0].length),
  )
}
// @end

// @snippet curve-bezierDerivative
// r 階導関数の制御点は、隣り合う制御点の差を次数倍して r 回作る。
export function bezierDerivative(points, t, order = 1) {
  if (points.length === 0) return []
  if (order === 0) return bezierPoint(points, t)
  if (!Number.isInteger(order) || order < 0) throw new RangeError('order must be a non-negative integer')
  if (order >= points.length) return zeroPoint(points[0].length)
  let derivativePoints = points.map((point) => point.slice())
  let degree = points.length - 1
  for (let r = 0; r < order; r++) {
    derivativePoints = derivativePoints.slice(0, -1).map((point, i) =>
      scalePoint(subtractPoint(derivativePoints[i + 1], point), degree),
    )
    degree--
  }
  return bezierPoint(derivativePoints, t)
}
// @end

// @snippet curve-uniformKnots
// 一様節点 t_i = i-degree を、制御点数+次数+1 個作る。
export function uniformKnots(count, degree) {
  return Array.from({ length: count + degree + 1 }, (_, i) => i - degree)
}
// @end

// @snippet curve-bsplineBasis
// Cox–de Boor の漸化式。0 次は半開区間の指示関数で、0 除算の項は 0 とする。
export function bsplineBasis(i, degree, t, knots) {
  if (degree === 0) {
    const last = knots.length - 1
    return (knots[i] <= t && t < knots[i + 1]) || (t === knots[last] && i === last - 1) ? 1 : 0
  }
  const leftDenominator = knots[i + degree] - knots[i]
  const rightDenominator = knots[i + degree + 1] - knots[i + 1]
  const left = leftDenominator === 0
    ? 0
    : ((t - knots[i]) / leftDenominator) * bsplineBasis(i, degree - 1, t, knots)
  const right = rightDenominator === 0
    ? 0
    : ((knots[i + degree + 1] - t) / rightDenominator) * bsplineBasis(i + 1, degree - 1, t, knots)
  return left + right
}
// @end

// @snippet curve-bsplinePoint
// 各制御点を B スプライン基底 N_i^degree(t) で重みづけして足す。
export function bsplinePoint(points, degree, knots, t) {
  if (points.length === 0) return []
  return points.reduce(
    (sum, point, i) => addPoint(sum, scalePoint(point, bsplineBasis(i, degree, t, knots))),
    zeroPoint(points[0].length),
  )
}
// @end

// @snippet curve-bsplineDerivative
// 導関数の制御点 degree(P_{i+1}-P_i)/(t_{i+degree+1}-t_{i+1}) を作る。
export function bsplineDerivative(points, degree, knots, t, order = 1) {
  if (points.length === 0) return []
  if (order === 0) return bsplinePoint(points, degree, knots, t)
  if (!Number.isInteger(order) || order < 0) throw new RangeError('order must be a non-negative integer')
  if (order > degree || order >= points.length) return zeroPoint(points[0].length)
  let derivativePoints = points.map((point) => point.slice())
  let derivativeKnots = knots.slice()
  let derivativeDegree = degree
  for (let r = 0; r < order; r++) {
    derivativePoints = derivativePoints.slice(0, -1).map((point, i) => {
      const denominator = derivativeKnots[i + derivativeDegree + 1] - derivativeKnots[i + 1]
      return denominator === 0
        ? zeroPoint(point.length)
        : scalePoint(subtractPoint(derivativePoints[i + 1], point), derivativeDegree / denominator)
    })
    derivativeKnots = derivativeKnots.slice(1, -1)
    derivativeDegree--
  }
  return bsplinePoint(derivativePoints, derivativeDegree, derivativeKnots, t)
}
// @end

// @snippet curve-chaikinStep
// 各辺の 1/4 と 3/4 に新しい 2 点を置き、元の角を切り落とす。
export function chaikinStep(points) {
  const result = []
  for (let i = 0; i < points.length - 1; i++) {
    result.push(lerpPoint(points[i], points[i + 1], 1 / 4))
    result.push(lerpPoint(points[i], points[i + 1], 3 / 4))
  }
  return result
}
// @end

// @snippet curve-chaikin
// Chaikin の角切りを指定回数だけ繰り返す。
export function chaikin(points, levels) {
  let result = points.map((point) => point.slice())
  for (let level = 0; level < levels; level++) result = chaikinStep(result)
  return result
}
// @end

// @snippet curve-curvature2D
// 符号つき曲率 κ = (x'y''-y'x'')/(x'^2+y'^2)^(3/2)。反時計回りを正にする。
export function curvature2D(d1, d2) {
  const speedSquared = d1[0] ** 2 + d1[1] ** 2
  if (speedSquared === 0) return 0
  return (d1[0] * d2[1] - d1[1] * d2[0]) / speedSquared ** 1.5
}
// @end

// @snippet curve-frame2D
// 1 階導関数を正規化した単位接線と、それを左へ 90° 回した単位法線を返す。
export function frame2D(d1) {
  const magnitude = Math.hypot(d1[0], d1[1])
  if (magnitude === 0) return { tangent: [0, 0], normal: [0, 0] }
  const tangent = [d1[0] / magnitude, d1[1] / magnitude]
  return { tangent, normal: [-tangent[1], tangent[0]] }
}
// @end

// @snippet curve-ellipsePoint
// 楕円 x=a cos(t), y=b sin(t) の媒介変数表示。
export function ellipsePoint(a, b, t) {
  return [a * Math.cos(t), b * Math.sin(t)]
}
// @end

// @snippet curve-ellipseImplicit
// 楕円の陰関数 F(x,y)=x^2/a^2+y^2/b^2-1。曲線上では 0 になる。
export function ellipseImplicit(a, b, x, y) {
  return x ** 2 / a ** 2 + y ** 2 / b ** 2 - 1
}
// @end

// @snippet curve-hyperbolaPoint
// 双曲線の右枝 x=a cosh(t), y=b sinh(t) の媒介変数表示。
export function hyperbolaPoint(a, b, t) {
  return [a * Math.cosh(t), b * Math.sinh(t)]
}
// @end

// @snippet curve-hyperbolaImplicit
// 双曲線の陰関数 F(x,y)=x^2/a^2-y^2/b^2-1。曲線上では 0 になる。
export function hyperbolaImplicit(a, b, x, y) {
  return x ** 2 / a ** 2 - y ** 2 / b ** 2 - 1
}
// @end

// @snippet curve-cross
// 3 次元ベクトルの外積。両方に直交する向きを返す。
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
// @end

// @snippet curve-bezierPatch
// u・v の 2 方向に 3 次バーンスタイン基底を掛け、双 3 次ベジエ曲面を作る。
export function bezierPatch(P, u, v) {
  let point = [0, 0, 0]
  let du = [0, 0, 0]
  let dv = [0, 0, 0]
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const bu = bernstein(3, i, u)
      const bv = bernstein(3, j, v)
      const dbu = 3 * (bernstein(2, i - 1, u) - bernstein(2, i, u))
      const dbv = 3 * (bernstein(2, j - 1, v) - bernstein(2, j, v))
      point = addPoint(point, scalePoint(P[i][j], bu * bv))
      du = addPoint(du, scalePoint(P[i][j], dbu * bv))
      dv = addPoint(dv, scalePoint(P[i][j], bu * dbv))
    }
  }
  const rawNormal = cross(du, dv)
  const magnitude = length(rawNormal)
  const normal = magnitude === 0 ? [0, 0, 0] : scalePoint(rawNormal, 1 / magnitude)
  return { point, du, dv, normal }
}
// @end
