const n=`// 補間: 線形補間と、自然境界条件の3次スプライン(DOM に触れない純関数)。
// 3次スプラインは、区間ごとに別々の3次式 S_i(x) = a t^3 + b t^2 + c t + d
// (t = x - x_i)をつなぐ。N 区間で未知数は 4N 個。節点を通る条件 2N 個と、
// 内側の節点での1階・2階微分の連続 2(N-1) 個を合わせても 4N-2 個で、2個足りない。
// 足りない2個は両端の2階微分 = 0 (自然スプライン)で補う。
// 係数は、節点の2階微分 m_i に関する三重対角の連立方程式をトーマス法で解いて
// 求める(行列が対角優位なのでピボット選択が要らない)。
// 出典: de Boor, A Practical Guide to Splines (1978) /
// Burden and Faires, Numerical Analysis, 9th ed. (2011)(自然3次スプライン) /
// Thomas, Elliptic problems in linear difference equations over a network (1949)

// @snippet spline-lerp
// 線形補間。2点を通る直線を、重み (1-t) と t の加重平均で書いた形。
// t=0 で a、t=1 でちょうど b になる(a + (b-a)t だと t=1 で丸め誤差が出る)
export function lerp(a, b, t) {
  return (1 - t) * a + t * b
}
// @end

// @snippet spline-solveTridiagonal
// 三重対角の連立方程式を前進消去と後退代入で解く(トーマス法、O(n))。
// 第 i 行は lower[i] x[i-1] + diag[i] x[i] + upper[i] x[i+1] = rhs[i]。
// lower[0] と upper[n-1] は使わない。対角優位ならピボット選択は要らない
export function solveTridiagonal(lower, diag, upper, rhs) {
  const n = diag.length
  if (n === 0) return []
  const c = new Array(n) // 前進消去で作る、上側の係数
  const d = new Array(n) // 前進消去で作る、右辺
  c[0] = upper[0] / diag[0]
  d[0] = rhs[0] / diag[0]
  for (let i = 1; i < n; i++) {
    const denom = diag[i] - lower[i] * c[i - 1]
    c[i] = upper[i] / denom
    d[i] = (rhs[i] - lower[i] * d[i - 1]) / denom
  }
  const x = new Array(n)
  x[n - 1] = d[n - 1]
  for (let i = n - 2; i >= 0; i--) x[i] = d[i] - c[i] * x[i + 1]
  return x
}
// @end

// @snippet spline-naturalCubicSpline
// 節点 (xs[i], ys[i]) を通る自然3次スプライン。区間 i の係数を返す
export function naturalCubicSpline(xs, ys) {
  const N = xs.length - 1 // 区間の数。未知数は 4N 個
  if (N < 1 || ys.length !== xs.length) {
    throw new RangeError('xs and ys need the same length, at least 2')
  }
  const h = xs.slice(1).map((x, i) => x - xs[i]) // 区間の幅
  if (h.some((hi) => !(hi > 0))) throw new RangeError('xs must be increasing')
  const slope = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi) // 区間の傾き
  // 内側の節点 i = 1..N-1 の2階微分 m_i が満たす連立方程式:
  // h[i-1] m[i-1] + 2 (h[i-1] + h[i]) m[i] + h[i] m[i+1]
  //   = 6 (slope[i] - slope[i-1])
  const [lower, diag, upper, rhs] = [[], [], [], []]
  for (let i = 1; i < N; i++) {
    lower.push(h[i - 1])
    diag.push(2 * (h[i - 1] + h[i]))
    upper.push(h[i])
    rhs.push(6 * (slope[i] - slope[i - 1]))
  }
  const m = [0, ...solveTridiagonal(lower, diag, upper, rhs), 0] // 両端は 0
  return {
    xs: xs.slice(),
    a: h.map((hi, i) => (m[i + 1] - m[i]) / (6 * hi)),
    b: h.map((hi, i) => m[i] / 2),
    c: h.map((hi, i) => slope[i] - (hi * (2 * m[i] + m[i + 1])) / 6),
    d: ys.slice(0, N),
  }
}
// @end

// @snippet spline-findSegment
// x が入る区間の番号 i (xs[i] <= x < xs[i+1])を二分探索で求める。
// 範囲の外は端の区間にする(端の3次式をそのまま延長して使う)
export function findSegment(xs, x) {
  let lo = 0
  let hi = xs.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}
// @end

// @snippet spline-evalSpline
// S_i(x) = a t^3 + b t^2 + c t + d (t = x - xs[i])を、ホーナー法で評価する
export function evalSpline(s, x) {
  const i = findSegment(s.xs, x)
  const t = x - s.xs[i]
  return ((s.a[i] * t + s.b[i]) * t + s.c[i]) * t + s.d[i]
}
// @end

// @snippet spline-evalSplineDeriv
// order 階の導関数。S' = 3a t^2 + 2b t + c、S'' = 6a t + 2b、S''' = 6a。
// つなぎ目では S' と S'' が左右の式で一致するので、折れ目も曲率の飛びもない
export function evalSplineDeriv(s, x, order = 1) {
  const i = findSegment(s.xs, x)
  const t = x - s.xs[i]
  const [a, b, c] = [s.a[i], s.b[i], s.c[i]]
  if (order === 0) return evalSpline(s, x)
  if (order === 1) return (3 * a * t + 2 * b) * t + c
  if (order === 2) return 6 * a * t + 2 * b
  return order === 3 ? 6 * a : 0
}
// @end
`;export{n as default};
