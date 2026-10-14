// 常微分方程式 dx/dt = u(t) の時間積分(前進オイラー法)。DOM に触れない純関数、依存ライブラリなし。
// 微分を有限の差分 (x(t+Δt) - x(t)) / Δt に置き換え、x(t+Δt) について解いた更新式
//   x(t+Δt) = x(t) + Δt·u(t)
// を n 回繰り返す。これは x(t+Δt) の 1 次のテイラー展開で、捨てた次の項 Δt²/2·x''(t) が
// 1 ステップの誤差になる。積み重なった全体の誤差は Δt に比例する(1 次精度)。
// u は (t, x) を受け取る関数。時刻だけの u(t) なら x は無視され、dx/dt = x² のように
// 現在の値で速度が決まる場合は x を使う。
// x は 1 つの数(スカラー)。位置のベクトルや多数の質点を進めるときは massSpring.js のように
// 成分ごとに同じ更新を行う。
// 出典: Hairer, Nørsett, Wanner, Solving Ordinary Differential Equations I, 2nd ed. (1993)

// @snippet integrate-eulerStep
// 時刻 t の速度 u(t) だけで次の値を決める(右辺は古い値)
export function eulerStep(x, u, t, dt) {
  return x + dt * u(t, x)
}
// @end

// @snippet integrate-integrateEuler
// 区間 [0, T] を n 等分して、x(0)=x0 から x(T) の近似を返す。
// 時刻は k*dt と掛け算で作る(dt を足し続けると丸め誤差がたまる)
export function integrateEuler(u, x0, T, n) {
  const dt = T / n
  let x = x0
  for (let k = 0; k < n; k++) x = eulerStep(x, u, k * dt, dt)
  return x
}
// @end

// @snippet integrate-integrateNewTime
// u を区間の右端(新しい時刻 t+Δt)で評価する形。eulerStep に渡す時刻を 1 つ進めるだけで、
// 更新の式は同じ。u が増える間は、integrateEuler とは逆に解析解より大きく出る
export function integrateNewTime(u, x0, T, n) {
  const dt = T / n
  let x = x0
  for (let k = 0; k < n; k++) x = eulerStep(x, u, (k + 1) * dt, dt)
  return x
}
// @end
