// 質点-ばね系(2 次元)と、風が布に与える力(DOM に触れない純関数、依存ライブラリなし)。
// 質点どうしをばねでつなぎ、運動方程式 m·dv/dt = F_ばね + F_減衰 + F_外力 を半陰的オイラー法で進める。
// 半陰的オイラー法は速度を先に更新し、新しい速度で位置を更新する: v' = v + Δt·F/m、x' = x + Δt·v'。
// 古い速度で位置を更新する前進オイラー法はばねの振動でエネルギーが毎ステップ増えて発散するが、
// 半陰的オイラー法は増え続けない。ただし Δt が大きすぎる(criticalDt を超える)と半陰的でも発散する。
//
// 状態は createMassSpringState(n) で作る。位置・速度・力は Float64Array に質点ごとの [x, y] を並べ、
//   state.pos / vel / force : Float64Array(2n)  x0, y0, x1, y1, ...(描画やコピーに使う)
//   state.p[i] / v[i] / f[i] : 質点 i の [x, y] を指す長さ 2 の view(同じメモリ。アルゴリズムはこちらを使う)
//   state.w[i]              : 質量の逆数。0 の質点は固定されて動かない
// pos・vel・w だけを持つ状態(位置ベース法の状態など)に渡すと、足りない force と view を最初の呼び出しで足す
// (attachViews)ので、同じ質点の状態を質点-ばね系と位置ベース法の両方で進められる。
// ばねは { i, j, k, kd, L0 }(質点 i と j をつなぐ。ばね定数、減衰係数、自然長)の配列。
// params は { gravity: [gx, gy], drag, external }(重力の加速度、速度に比例する抵抗の係数、
// 力を state.f に足し込む関数。どれも省略できる)。
// 1 ステップの関数は配列を作らず、状態をその場で書き換える。
// 出典:
//   Provot, Deformation constraints in a mass-spring model to describe rigid cloth behavior, Graphics Interface (1995): 布の質点-ばねモデル
//   Hairer, Lubich, Wanner, Geometric Numerical Integration (2002): 半陰的(シンプレクティック)オイラー法
//   Anderson, Fundamentals of Aerodynamics, 6th ed. (2017): 揚力 L = ½ρ|U|²S·C_L と抗力 D = ½ρ|U|²S·C_D

const NO_GRAVITY = [0, 0]
const scratch = [0, 0]

// pos・vel・w だけを持つ状態に、力の領域 force と、質点ごとの view(p・v・f)を足す。足してあれば何もしない
export function attachViews(state) {
  if (state.p) return state
  const n = state.w.length
  state.n = n
  state.force = state.force || new Float64Array(2 * n)
  const views = (array) => Array.from({ length: n }, (_, i) => array.subarray(2 * i, 2 * i + 2))
  state.p = views(state.pos)
  state.v = views(state.vel)
  state.f = views(state.force)
  return state
}

// 質点 n 個の状態を作る。質量はすべて 1(w=1)で、位置も速度もゼロ
export function createMassSpringState(n) {
  return attachViews({ pos: new Float64Array(2 * n), vel: new Float64Array(2 * n), w: new Float64Array(n).fill(1) })
}

// @snippet massSpring-springForce
// 質点 p1 にかかるばねの力(質点 p2 にかかる力は逆向き)。
// 伸びに比例する力 k(L - L0) と、ばねの向きの相対速度に比例する減衰 kd·(v2 - v1)·n を、
// p1 から p2 へ向かう単位ベクトル n の向きに足す
export function springForce(p1, p2, v1, v2, k, kd, L0, out = [0, 0]) {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const L = Math.sqrt(dx * dx + dy * dy)
  if (L === 0) {
    out[0] = 0 // 長さ 0 ではばねの向きが決まらない
    out[1] = 0
    return out
  }
  const nx = dx / L
  const ny = dy / L
  const stretchRate = (v2[0] - v1[0]) * nx + (v2[1] - v1[1]) * ny
  const magnitude = k * (L - L0) + kd * stretchRate
  out[0] = magnitude * nx
  out[1] = magnitude * ny
  return out
}
// @end

// @snippet massSpring-computeForces
// 各質点の力を state.f に集める。速度に比例する抵抗から始めて、ばねの力を両端の質点に
// 逆向きに足し、最後に外から足す力(風など)を呼ぶ
export function computeForces(state, springs, params) {
  if (!state.p) attachViews(state)
  const { n, v, f } = state
  const drag = params.drag || 0
  for (let i = 0; i < n; i++) {
    f[i][0] = -drag * v[i][0]
    f[i][1] = -drag * v[i][1]
  }
  for (let s = 0; s < springs.length; s++) {
    const { i, j, k, kd, L0 } = springs[s]
    springForce(state.p[i], state.p[j], v[i], v[j], k, kd, L0, scratch)
    f[i][0] += scratch[0]
    f[i][1] += scratch[1]
    f[j][0] -= scratch[0]
    f[j][1] -= scratch[1]
  }
  if (params.external) params.external(state)
}
// @end

// @snippet massSpring-massSpringStep
// 半陰的オイラー法の 1 ステップ。重力は質量によらない加速度 g として足す
export function massSpringStep(state, springs, params, dt) {
  computeForces(state, springs, params)
  const g = params.gravity || NO_GRAVITY
  const { n, w, p, v, f } = state
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue // 固定した質点は動かさない
    v[i][0] += dt * (g[0] + w[i] * f[i][0]) // 速度を先に更新して、
    v[i][1] += dt * (g[1] + w[i] * f[i][1])
    p[i][0] += dt * v[i][0] // 新しい速度で位置を更新する
    p[i][1] += dt * v[i][1]
  }
}
// @end

// @snippet massSpring-massSpringStepExplicit
// 比べるための前進オイラー法。古い速度で位置を更新してから、速度を更新する。
// ばね 1 本の振動ではエネルギーが毎ステップ (1 + k·Δt²/m) 倍になり、発散する
export function massSpringStepExplicit(state, springs, params, dt) {
  computeForces(state, springs, params)
  const g = params.gravity || NO_GRAVITY
  const { n, w, p, v, f } = state
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue
    p[i][0] += dt * v[i][0] // 古い速度で位置を更新して、
    p[i][1] += dt * v[i][1]
    v[i][0] += dt * (g[0] + w[i] * f[i][0]) // それから速度を更新する
    v[i][1] += dt * (g[1] + w[i] * f[i][1])
  }
}
// @end

// @snippet massSpring-criticalDt
// 質量 m の質点 1 個とばね定数 k のばね 1 本が、半陰的オイラー法で安定な Δt の上限。
// 1 ステップを (x, v) の行列にすると行列式は 1、トレースは 2 - (ωΔt)²(ω = √(k/m))で、
// 固有値の大きさが 1 を超えないのは ωΔt < 2。質点が多いときは最大の固有振動数 ω_max で 2/ω_max
export function criticalDt(m, k) {
  return 2 * Math.sqrt(m / k)
}
// @end

// 運動エネルギー ½mv² の和と、ばねの弾性エネルギー ½k(L - L0)² の和
export function massSpringEnergy(state, springs) {
  if (!state.p) attachViews(state)
  let kinetic = 0
  for (let i = 0; i < state.n; i++) {
    if (state.w[i] === 0) continue
    kinetic += (0.5 * (state.v[i][0] * state.v[i][0] + state.v[i][1] * state.v[i][1])) / state.w[i]
  }
  let elastic = 0
  for (const { i, j, k, L0 } of springs) {
    const L = Math.hypot(state.p[j][0] - state.p[i][0], state.p[j][1] - state.p[i][1])
    elastic += 0.5 * k * (L - L0) * (L - L0)
  }
  return { kinetic, elastic }
}

// @snippet massSpring-aeroForce
// 風が板(面積 S、単位法線 n)に与える力。U は空気の板に対する相対速度、rho は空気の密度。
//   抗力 D = ½ C_D ρ S |U| U            U と同じ向き
//   揚力 L = ½ C_L ρ S (U × n) × U      U に垂直(2 次元では z=0 の 3 次元ベクトルとして外積をとる)
// 3 重積の公式 (U × n) × U = n(U·U) - U(n·U) で、外積なしに 2 次元でも 3 次元でも書ける。
// どちらも |U|² に比例し、風が 2 倍になると力は 4 倍になる。out を渡すと配列を作らずに書き換える
export function aeroForce(U, n, S, rho, CL, CD, out = { lift: [], drag: [] }) {
  let UU = 0
  let nU = 0
  for (let i = 0; i < U.length; i++) {
    UU += U[i] * U[i]
    nU += n[i] * U[i]
  }
  const speed = Math.sqrt(UU)
  const q = 0.5 * rho * S
  for (let i = 0; i < U.length; i++) {
    out.lift[i] = q * CL * (n[i] * UU - U[i] * nU)
    out.drag[i] = q * CD * speed * U[i]
  }
  return out
}
// @end

const windU = [0, 0]
const windN = [0, 0]
const windOut = { lift: [0, 0], drag: [0, 0] }

// @snippet massSpring-addWindForces
// 質点 i と j を結ぶ線分を板(面積 = 長さ × depth)とみなして、風の力を両端の質点に半分ずつ足す。
// 風 wind は空気の速度で、板の速度は両端の平均。法線は風下を向くようにそろえる
// (向きを逆にすると揚力の向きも逆になるので、風が当たる面を決めてから使う)
export function addWindForces(state, segments, wind, depth, rho, CL, CD) {
  if (!state.p) attachViews(state)
  const { p, v, f } = state
  for (let s = 0; s < segments.length; s++) {
    const { i, j } = segments[s]
    const dx = p[j][0] - p[i][0]
    const dy = p[j][1] - p[i][1]
    const L = Math.sqrt(dx * dx + dy * dy)
    if (L === 0) continue
    windU[0] = wind[0] - (v[i][0] + v[j][0]) / 2
    windU[1] = wind[1] - (v[i][1] + v[j][1]) / 2
    const side = dx * windU[1] - dy * windU[0] >= 0 ? 1 : -1 // 線分の法線 (-dy, dx) が風下を向く側
    windN[0] = (-dy / L) * side
    windN[1] = (dx / L) * side
    aeroForce(windU, windN, L * depth, rho, CL, CD, windOut)
    for (let k = 0; k < 2; k++) {
      const half = (windOut.lift[k] + windOut.drag[k]) / 2
      f[i][k] += half
      f[j][k] += half
    }
  }
}
// @end
