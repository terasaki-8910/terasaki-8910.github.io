// 布の節の段階 1〜5 が使う「壁につないだ 1 本のバネと 1 つのおもり」(React にも DOM にも依存しない)。
// 力と時間の進め方は src/utils/vis/massSpring.js の関数だけで行い、ここは質点 2 個(壁とおもり)の状態を持って呼ぶ順番を決める。
// 壁は x = 0 に固定(w = 0)、おもりは x 軸の上だけを動く(y の力は 0 のまま)。伸び x = (今の長さ) − (自然長 L0)、
// 右へ伸びる向きが正。
//   x = 0 のとき、おもりは壁から L0 の所にある。
import {
  createMassSpringState,
  criticalDt,
  massSpringEnergy,
  massSpringStep,
  massSpringStepExplicit,
  springForce,
} from '../../../utils/vis/massSpring.js'

export const L0 = 1 // バネの自然長 [m]
export const X_LIMIT = 0.6 // 手で動かせる伸び・縮みの大きさの上限 [m]
export const DIVERGE_X = 1e3 // これより遠くへ飛んだら、計算が発散したとみなす [m]

const NO_GRAVITY = [0, 0]
const scratch = [0, 0]
const zero = [0, 0]

// m [kg]、k [N/m]、kd [N s/m]、x は最初の伸び [m]。おもりは止まっている
export function createSpring1d({ m = 1, k = 16, kd = 0, x = 0 } = {}) {
  const state = createMassSpringState(2)
  state.w[0] = 0 // 壁
  state.w[1] = 1 / m
  state.pos[2] = L0 + x
  return {
    state,
    springs: [{ i: 0, j: 1, k, kd, L0 }],
    params: { gravity: NO_GRAVITY, drag: 0 },
    m,
    k,
    kd,
    hand: null, // 手でつかんでいる伸び [m]。null ならつかんでいない
    diverged: false,
  }
}

// m・k・kd のうち渡したものだけ変える(動いている途中でも変えられる)
export function setConstants(world, { m, k, kd }) {
  if (m !== undefined) {
    world.m = m
    world.state.w[1] = 1 / m
  }
  if (k !== undefined) {
    world.k = k
    world.springs[0].k = k
  }
  if (kd !== undefined) {
    world.kd = kd
    world.springs[0].kd = kd
  }
}

export const extensionOf = (world) => world.state.pos[2] - world.state.pos[0] - L0
export const velocityOf = (world) => world.state.vel[2]

// おもりを伸び x の所に止めて置く(速度 0)
export function placeAt(world, x) {
  world.state.pos[2] = L0 + x
  world.state.vel[2] = 0
  world.state.pos[3] = 0
  world.state.vel[3] = 0
  world.diverged = false
}

export function clampExtension(x) {
  return Math.max(-X_LIMIT, Math.min(X_LIMIT, x))
}

// 手でつかむ(x を渡す)・離す(null)。つかんでいるあいだ、おもりは手の位置にあり、step は物理を進めない
export function holdHand(world, x) {
  world.hand = x === null ? null : clampExtension(x)
  if (world.hand !== null) placeAt(world, world.hand)
}

// バネがおもりに与える力の x 成分 [N]。F = k(L − L0)·n + kd·(相対速度)·n を springForce で求める
// (n はおもりから壁へ向かう単位ベクトルなので、伸びていれば負、縮んでいれば正)
export function forceOnMass(world) {
  const { pos, vel } = world.state
  const p1 = [pos[2], pos[3]]
  const p2 = [pos[0], pos[1]]
  const v1 = [vel[2], vel[3]]
  const v2 = [vel[0], vel[1]]
  return springForce(p1, p2, v1, v2, world.k, world.kd, L0, scratch)[0]
}

// 伸び x での、減衰のないバネの力 [N](フックの法則 F = −kx のグラフの線を引くとき)
export function hookeForce(k, x) {
  return springForce([L0 + x, 0], zero, zero, zero, k, 0, L0, scratch)[0]
}

// 1 ステップ進める。method は 'semi'(半陰的オイラー法)か 'explicit'(前進オイラー法)。
// つかんでいるあいだは手の位置に置くだけ。発散したら何もしない
export function stepSpring1d(world, method, dt) {
  if (world.diverged) return
  if (world.hand !== null) {
    placeAt(world, world.hand)
    return
  }
  const { state, springs, params } = world
  if (method === 'explicit') massSpringStepExplicit(state, springs, params, dt)
  else massSpringStep(state, springs, params, dt)
  const x = extensionOf(world)
  if (!(Math.abs(x) < DIVERGE_X)) world.diverged = true // 範囲の外か NaN
}

// ½mv² + ½kx² [J]
export function spring1dEnergy(world) {
  const { kinetic, elastic } = massSpringEnergy(world.state, world.springs)
  return kinetic + elastic
}

// ---- 解析解と、バネの目安の量 ----

export const angularFrequency = (m, k) => Math.sqrt(k / m) // ω = √(k/m) [rad/s]
export const periodOf = (m, k) => (2 * Math.PI) / angularFrequency(m, k) // T = 2π√(m/k) [s]
export const criticalDamping = (m, k) => 2 * Math.sqrt(m * k) // これ以上の k_d では振動しない [N s/m]
export const decayRate = (m, kd) => kd / (2 * m) // 振幅が e^{−γt} で小さくなる γ [1/s]
export const stableDt1d = (m, k) => criticalDt(m, k) // 半陰的オイラー法の安定の限界 2√(m/k) [s]
// 前進オイラー法で、1 ステップごとにエネルギーが何倍になるか(1 + kΔt²/m)
export const explicitEnergyFactor = (m, k, dt) => 1 + (k * dt * dt) / m

// m·x'' = −k·x − kd·x' の解。時刻 τ(出発してからの時間)の伸び [m]。出発の伸び x0 と速度 v0 を与える。
// 振動する(kd < 2√(mk))・臨界・振動しない(kd > 2√(mk))の 3 通り
export function analyticX(tau, { m, k, kd }, x0, v0 = 0) {
  const w0 = Math.sqrt(k / m)
  const g = kd / (2 * m)
  const disc = w0 * w0 - g * g
  const eps = 1e-9 * w0 * w0
  if (disc > eps) {
    const wd = Math.sqrt(disc)
    return Math.exp(-g * tau) * (x0 * Math.cos(wd * tau) + ((v0 + g * x0) / wd) * Math.sin(wd * tau))
  }
  if (disc >= -eps) return Math.exp(-g * tau) * (x0 + (v0 + g * x0) * tau)
  const s = Math.sqrt(-disc)
  const r1 = -g + s
  const r2 = -g - s
  const c1 = (v0 - r2 * x0) / (r1 - r2)
  return c1 * Math.exp(r1 * tau) + (x0 - c1) * Math.exp(r2 * tau)
}

// 振動する(kd < 2√(mk))とき、振幅が e^{−γτ} で小さくなる包絡線の最初の大きさ A [m]。
// x = A·e^{−γτ}·cos(ω_d τ − φ) と書けるので、A = √(x0² + ((v0 + γ·x0)/ω_d)²)。振動しないときは null
export function envelopeAmplitude({ m, k, kd }, x0, v0 = 0) {
  const g = kd / (2 * m)
  const disc = k / m - g * g
  if (!(disc > 1e-9 * (k / m))) return null
  const wd = Math.sqrt(disc)
  const b = (v0 + g * x0) / wd
  return Math.sqrt(x0 * x0 + b * b)
}
