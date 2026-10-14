// 拘束つきの運動(振り子)と、拘束のずれの直し方(DOM に触れない純関数、依存ライブラリなし)。
// 拘束 C(x) = ½(x·x - 1) = 0 は、質点を原点から距離 1 の円周に縛る(長さ 1 の振り子)。
// C を時間で微分すると Ċ = x·ẋ = J v で、ヤコビアン J = ∂C/∂x は横ベクトル xᵀ。
// 拘束力は J の向き f_c = Jᵀλ = λx で、C̈ = 0 から λ が決まる。
// 数値積分では 1 ステップごとの誤差で C のずれがたまるので、ずれ C に比例した速度を足して直す
// (ERP / CFM、Soft Constraint)。
// 出典:
//   Witkin and Baraff, Physically Based Modeling: Principles and Practice, SIGGRAPH Course Notes (1997): 拘束力 Jᵀλ と λ の求め方
//   Smith, Open Dynamics Engine User Guide (2006): ERP と CFM
//   Catto, Soft Constraints, GDC (2011): J v + (β/Δt) C + γλ = 0 の形

// @snippet constraint-pendulumLambda
// C̈ = ẋ·ẋ + x·ẍ = 0 に、運動方程式 ẍ = (f + λx)/m を入れて λ について解く。
// x: 位置 [x, y]、v: 速度 [vx, vy]、f: 外力 [fx, fy]、m: 質量
export function pendulumLambda(x, v, f, m) {
  const xx = x[0] * x[0] + x[1] * x[1]
  const xf = x[0] * f[0] + x[1] * f[1]
  const vv = v[0] * v[0] + v[1] * v[1]
  return (-xf - m * vv) / xx
}
// @end

// @snippet constraint-pendulumStep
// state = { x: [x, y], v: [vx, vy] } を 1 ステップ進める(配列はその場で書き換える)。
// 速度を先に更新して、新しい速度で位置を更新する。返り値は使った λ(拘束力の大きさ)
export function pendulumStep(state, f, m, dt) {
  const { x, v } = state
  const lambda = pendulumLambda(x, v, f, m)
  v[0] += (dt * (f[0] + lambda * x[0])) / m
  v[1] += (dt * (f[1] + lambda * x[1])) / m
  x[0] += dt * v[0]
  x[1] += dt * v[1]
  return lambda
}
// @end

// @snippet constraint-softLambda
// J v + (β/Δt)·C + γ·λ = 0 を λ について解く。
// γ が小さいほど拘束は固く(力が大きく)、γ=0 は固い拘束で λ は連立方程式から決まるので γ > 0 が要る。
// Jv: 拘束の速度、C: 拘束のずれ、β: 1 ステップで直す割合(ERP)、γ: CFM
export function softLambda(Jv, C, beta, gamma, dt) {
  return -(Jv + (beta / dt) * C) / gamma
}
// @end

// @snippet constraint-erpDecay
// ERP だけで直したときのずれ。1 ステップで C を (1-β) 倍にしたい:
//   C + Δt·J v = (1-β)·C  →  J v = -(β/Δt)·C
// この J v の速度で動くと C は毎ステップ (1-β) 倍になるので、n ステップ後は C0·(1-β)ⁿ
export function erpDecay(C0, beta, n, dt = 1 / 60) {
  let C = C0
  for (let k = 0; k < n; k++) {
    const Jv = -(beta / dt) * C
    C += dt * Jv
  }
  return C
}
// @end
