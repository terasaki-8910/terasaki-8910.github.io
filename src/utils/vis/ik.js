// 2リンクの平面アームの順運動学(FK)と逆運動学(IK)(DOM に触れない純関数)。
// 根元は原点で、リンクの長さは l1, l2。θ1 は x 軸から測った1本目の向き、
// θ2 は1本目の延長線から反時計回りに測った曲げ角(2本目の向きは θ1 + θ2)。
// θ2 を時計回りに測る流儀(2本目の向きが θ1 - θ2)もあり、その場合は
// θ2 の符号を反転して読み替える。角度はラジアン。点とベクトルは [x, y]。
// 出典: Craig, Introduction to Robotics: Mechanics and Control (2005)
// (余弦定理による解析解とヤコビアン) /
// Wampler, IEEE Trans. Systems, Man, and Cybernetics 16(1) (1986) と
// Nakamura and Hanafusa, J. Dynamic Systems, Measurement, and Control 108(3) (1986)
// (減衰つき最小二乗) / Buss, Introduction to Inverse Kinematics with Jacobian
// Transpose, Pseudoinverse and Damped Least Squares methods (2004)

// @snippet ik-fk2
// 順運動学。根元から肘、肘から手先へ、向きに長さを掛けて足していく。
// 長さ一定の制約(|肘| = l1、|手先 - 肘| = l2)は、この形なら自動で満たされる
export function fk2(l1, l2, theta1, theta2) {
  const elbow = [l1 * Math.cos(theta1), l1 * Math.sin(theta1)]
  const tip = [
    elbow[0] + l2 * Math.cos(theta1 + theta2),
    elbow[1] + l2 * Math.sin(theta1 + theta2),
  ]
  return { elbow, tip }
}
// @end

// @snippet ik-ik2Analytic
// 余弦定理による解析解。原点・肘・手先 (x, y) の三角形の辺は l1, l2, r。
//   l2^2 = l1^2 + r^2 - 2 l1 r cos(alpha)   (alpha: 原点での角)
//   r^2 = l1^2 + l2^2 + 2 l1 l2 cos(theta2)
// 解は2つ。elbowUp=true は肘が原点→目標の直線の反時計回り側(上)の解。
// 届かないとき(r > l1 + l2 や r < |l1 - l2|)は acos の中身を [-1, 1] に
// 切り詰め、目標に最も近い姿勢(伸ばしきる、または折りたたむ)にする
export function ik2Analytic(l1, l2, x, y, elbowUp = true) {
  const clamp = (v) => Math.min(1, Math.max(-1, v))
  const r2 = x * x + y * y
  const r = Math.sqrt(r2)
  const cosAlpha = r === 0 ? 1 : (l1 * l1 + r2 - l2 * l2) / (2 * l1 * r)
  const alpha = Math.acos(clamp(cosAlpha))
  const theta2 = Math.acos(clamp((r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)))
  const sign = elbowUp ? 1 : -1
  return [Math.atan2(y, x) + sign * alpha, -sign * theta2]
}
// @end

// @snippet ik-jacobian2
// ヤコビアン J = d(x, y)/d(theta1, theta2)。手先の速度 = J × 関節の角速度。
// 第1列は関節1だけを回したときの手先の動き(= (-y, x))、
// 第2列は関節2だけを回したときの動き。
// det J = l1 l2 sin(theta2) なので、theta2 = 0, pi (伸びきる・
// 折りたたむ姿勢)で特異になる
export function jacobian2(l1, l2, theta1, theta2) {
  const s1 = Math.sin(theta1)
  const c1 = Math.cos(theta1)
  const s12 = Math.sin(theta1 + theta2)
  const c12 = Math.cos(theta1 + theta2)
  return [
    [-l1 * s1 - l2 * s12, -l2 * s12],
    [l1 * c1 + l2 * c12, l2 * c12],
  ]
}
// @end

// @snippet ik-ikStep
// 数値解法の1ステップ。手先の誤差 e = 目標 - 手先 を、関節角の変化
// dtheta に直す。dtheta = J^-1 e は特異な姿勢で破綻するので、
// 減衰つき最小二乗
//   dtheta = J^T (J J^T + lambda^2 I)^-1 e
// を使う(lambda = 0 なら J^-1 e と同じ)。lambda が大きいほど安定だが、
// 歩みは小さい。J は微小な動きでしか正しくないので、
// |dtheta| が maxStep を超えないよう縮める
export function ikStep(l1, l2, theta, target, lambda, maxStep = Infinity) {
  const [t1, t2] = theta
  const { tip } = fk2(l1, l2, t1, t2)
  const e = [target[0] - tip[0], target[1] - tip[1]]
  const J = jacobian2(l1, l2, t1, t2)
  // A = J J^T + lambda^2 I は 2×2 の対称行列 [[p, q], [q, s]]。
  // その逆行列を公式で求めて w = A^-1 e とする
  const p = J[0][0] ** 2 + J[0][1] ** 2 + lambda ** 2
  const q = J[0][0] * J[1][0] + J[0][1] * J[1][1]
  const s = J[1][0] ** 2 + J[1][1] ** 2 + lambda ** 2
  const det = p * s - q * q
  const w = [(s * e[0] - q * e[1]) / det, (p * e[1] - q * e[0]) / det]
  const d1 = J[0][0] * w[0] + J[1][0] * w[1] // dtheta = J^T w
  const d2 = J[0][1] * w[0] + J[1][1] * w[1]
  const k = Math.min(1, maxStep / Math.hypot(d1, d2))
  return [t1 + k * d1, t2 + k * d2]
}
// @end

// @snippet ik-solveIK
// 手先が目標に届くまで ikStep を繰り返す。届いたか(converged)、
// 反復の回数(iterations)、最後の手先の誤差(error)も返す。
// 既定の lambda = 0.2 と 1歩の上限 0.3 rad は、長さ 1 前後の腕向けの値
export function solveIK(l1, l2, theta0, target, opts = {}) {
  const { lambda = 0.2, maxStep = 0.3, tol = 1e-6, maxIter = 200 } = opts
  let theta = theta0
  for (let i = 0; ; i++) {
    const { tip } = fk2(l1, l2, theta[0], theta[1])
    const error = Math.hypot(target[0] - tip[0], target[1] - tip[1])
    if (error < tol || i === maxIter) {
      return { theta, iterations: i, error, converged: error < tol }
    }
    theta = ikStep(l1, l2, theta, target, lambda, maxStep)
  }
}
// @end
