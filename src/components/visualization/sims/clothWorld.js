// 「バネ-質点系と位置ベース法」のシミュレーションの世界(React にも DOM にも依存しない)。
// 同じ質点の状態(pos・vel・w)を、質点-ばね系(半陰的オイラー法)と位置ベース法のどちらでも進められる。
// 計算は src/utils/vis の massSpring.js・pbd.js・integrate.js の関数だけで行い、ここは状態を持って呼ぶ順番を決める。
// 長さは m、座標は x が右、y が上。網は 2 次元(縦と横の格子)で、質点の質量はすべて NODE_MASS。
// 状態は作り直さず使い回す(毎ステップ配列を作らない)。
import { createCloth, pbdStep } from '../../../utils/vis/pbd.js'
import { addWindForces, attachViews, computeForces, createMassSpringState, criticalDt, massSpringStep } from '../../../utils/vis/massSpring.js'
import { advance } from './euler.js'

export const WORLD_W = 4 // 描く範囲の幅 [m]
export const WORLD_H = 3 // 高さ [m]
export const COLS = 14
export const ROWS = 10
export const SPACING = 0.2 // 質点の間隔 = ばねの自然長 [m]
export const NODE_MASS = 0.05 // 質点 1 個の質量 [kg]
export const GRAVITY = 9.8 // [m/s²]
export const AIR_RATE = 0.4 // 質点の速度が空気抵抗で減る割合 [1/s](両方の方式で同じにそろえる)
export const AIR_DENSITY = 1.2 // [kg/m³]
export const PLATE_DEPTH = 0.1 // 風を受ける板(網の辺)の奥行き [m]。面積 = 辺の長さ × 奥行き
export const GRAB_SPEED = 3 // つかんだ質点がポインタを追う速さの上限 [m/s]
const DIVERGE_LIMIT = 100 // これより遠くへ飛んだら、計算が発散したとみなす [m]

const gravityVector = [0, -GRAVITY]

// 既定は全体の網(14 × 10 個、間隔 0.2 m、世界 4 m × 3 m)。段階の小さい網は cols・rows・spacing・worldW・worldH を渡す
export function createClothWorld({
  pin = 'edge',
  k = 300,
  kd = 0.5,
  cols = COLS,
  rows = ROWS,
  spacing = SPACING,
  worldW = WORLD_W,
  worldH = WORLD_H,
} = {}) {
  const x0 = (worldW - (cols - 1) * spacing) / 2
  const y0 = worldH - 0.55 // 上の辺の少し下(絵の右上の重力の凡例と重ならないように)
  const cloth = createCloth(cols, rows, spacing, x0, y0)
  const { state, constraints } = cloth
  state.w.fill(1 / NODE_MASS)
  attachViews(state)
  const springs = constraints.map((c) => ({ i: c.i, j: c.j, k, kd, L0: c.d }))
  const isStructural = (c) => c.d === spacing
  const world = {
    cols,
    rows,
    spacing,
    worldW,
    worldH,
    state,
    constraints, // 位置ベース法の距離の拘束 { i, j, d }
    springs, // 質点-ばね系のばね { i, j, k, kd, L0 }(拘束と同じ並び)
    structuralSprings: springs.filter((_, s) => isStructural(constraints[s])), // 縦横のばねだけ(斜めを外す段階 7 用)
    structuralConstraints: constraints.filter(isStructural),
    segments: constraints.filter(isStructural), // 風を受ける板にする辺(縦と横。斜めは除く)
    pin,
    k,
    kd,
    wind: [0, 0],
    aero: { CL: 0, CD: 1 },
    grab: { index: -1, tx: 0, ty: 0 },
    diverged: false,
    msParams: { gravity: gravityVector, drag: NODE_MASS * AIR_RATE, external: null },
    pbdParams: { gravity: gravityVector, iterations: 8, damping: 0, box: null },
    positions0: new Float64Array(state.pos), // リセット用の初期位置
  }
  world.msParams.external = (s) => {
    if (world.wind[0] !== 0) addWindForces(s, world.segments, world.wind, PLATE_DEPTH, AIR_DENSITY, world.aero.CL, world.aero.CD)
  }
  applyPins(world, pin)
  return world
}

export function resetCloth(world) {
  const { state } = world
  state.pos.set(world.positions0)
  state.vel.fill(0)
  state.force.fill(0)
  state.pred.set(world.positions0)
  world.diverged = false
  world.grab.index = -1
  state.w.fill(1 / NODE_MASS) // つかんでいた質点の重さも戻してから、固定をかけ直す
  applyPins(world, world.pin)
}

// 上の辺の固定の仕方。'edge' = 上の辺ぜんぶ、'corners' = 上の辺の両端だけ
export function applyPins(world, mode) {
  world.pin = mode
  const free = 1 / NODE_MASS
  for (let c = 0; c < world.cols; c++) {
    const pinned = mode === 'edge' || c === 0 || c === world.cols - 1
    if (c === world.grab.index) continue // つかんでいる質点は離すときに戻す
    world.state.w[c] = pinned ? 0 : free
    if (pinned) {
      world.state.vel[2 * c] = 0
      world.state.vel[2 * c + 1] = 0
    }
  }
}

export function isPinned(world, i) {
  return i < world.cols && (world.pin === 'edge' || i === 0 || i === world.cols - 1)
}

// ---- つかむ ----

// (x, y) [m] から radius の中にあるいちばん近い、固定されていない質点をつかむ。つかめたら true
export function grabNode(world, x, y, radius) {
  const { pos } = world.state
  let best = -1
  let bestD2 = radius * radius
  for (let i = 0; i < world.state.n; i++) {
    if (isPinned(world, i)) continue
    const dx = x - pos[2 * i]
    const dy = y - pos[2 * i + 1]
    const d2 = dx * dx + dy * dy
    if (d2 <= bestD2) {
      best = i
      bestD2 = d2
    }
  }
  if (best < 0) return false
  world.grab.index = best
  world.grab.tx = pos[2 * best]
  world.grab.ty = pos[2 * best + 1]
  world.state.w[best] = 0 // 動かせない質点として扱う(位置はポインタに合わせる)
  return true
}

// つかんだ質点が動ける範囲。網は引っぱっても伸びるだけで、遠くへ引きすぎると、位置ベース法の拘束の補正が
// 裏返って網が絡まり、質点-ばね系は力が大きくなりすぎて崩れる。そこで、最初の位置からの距離を
// 「0.15 m + 固定した辺からの段数 × 間隔 × TETHER」以内に収める(固定に近い質点ほど動ける範囲が小さい)
export const TETHER = 0.4
function limitReach(world, i, x, y, out) {
  const row = Math.floor(i / world.cols)
  const reach = 0.15 + row * world.spacing * TETHER
  const ax = world.positions0[2 * i]
  const ay = world.positions0[2 * i + 1]
  const dx = x - ax
  const dy = y - ay
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d <= reach) {
    out[0] = x
    out[1] = y
  } else {
    out[0] = ax + (dx * reach) / d
    out[1] = ay + (dy * reach) / d
  }
}

const limited = [0, 0]

// つかんだ質点の目標の位置(ポインタの位置)
export function moveGrab(world, x, y) {
  const g = world.grab
  if (g.index < 0) return
  g.tx = x
  g.ty = y
}

// つかんだ質点を目標の位置へ動かす(質点-ばね系のステップの前と、止まっているあいだの表示用)。
// tethered なら動ける範囲(limitReach)に収める。dt を渡すと、1 回に動ける距離は GRAB_SPEED·dt まで
// (急に遠くへ飛ばして網を乱さない)
export function snapGrab(world, dt = 0, tethered = true) {
  const g = world.grab
  if (g.index < 0) return
  const { pos, vel } = world.state
  const i = g.index
  if (tethered) limitReach(world, i, g.tx, g.ty, limited)
  else {
    limited[0] = g.tx
    limited[1] = g.ty
  }
  let dx = limited[0] - pos[2 * i]
  let dy = limited[1] - pos[2 * i + 1]
  if (dt > 0) {
    const max = GRAB_SPEED * dt
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > max) {
      dx *= max / d
      dy *= max / d
    }
  }
  pos[2 * i] += dx
  pos[2 * i + 1] += dy
  vel[2 * i] = 0
  vel[2 * i + 1] = 0
}

// キーボードの代わりのつかみ方: 固定されていない全部の質点に速度 (dvx, dvy) [m/s] を足して揺らす
export function nudgeAll(world, dvx, dvy) {
  const { vel, w } = world.state
  for (let i = 0; i < world.state.n; i++) {
    if (w[i] === 0) continue
    vel[2 * i] += dvx
    vel[2 * i + 1] += dvy
  }
}

export function releaseGrab(world) {
  const g = world.grab
  if (g.index < 0) return
  const i = g.index
  g.index = -1
  world.state.w[i] = 1 / NODE_MASS
}

// ---- 1 ステップ ----

function checkDiverged(world) {
  const { pos } = world.state
  for (let i = 0; i < pos.length; i++) {
    const v = pos[i]
    if (!(v > -DIVERGE_LIMIT && v < DIVERGE_LIMIT)) {
      world.diverged = true // 範囲の外か NaN
      return
    }
  }
}

// 1 回ぶんの時間 dt を進める。p = { method: 'springs' | 'pbd', k, kd, iterations, windSpeed, CD, CL, diagonals }
// diagonals が false なら、斜めのばね(拘束)を使わない(縦横だけ。省略は使う)
export function stepCloth(world, p, dt) {
  if (world.diverged) return
  const { state } = world
  const useDiagonals = p.diagonals !== false
  const springs = world.springs // k・kd は斜めも含めて書き換える
  const activeSprings = useDiagonals ? world.springs : world.structuralSprings
  const activeConstraints = useDiagonals ? world.constraints : world.structuralConstraints
  world.wind[0] = p.windSpeed
  world.aero.CD = p.CD
  world.aero.CL = p.CL
  const grab = world.grab
  if (p.method === 'springs') {
    if (grab.index >= 0) state.w[grab.index] = 0 // 動かせない質点として扱い、ポインタの位置へ動かす
    snapGrab(world, dt, true)
    if (world.k !== p.k || world.kd !== p.kd) {
      world.k = p.k
      world.kd = p.kd
      for (let s = 0; s < springs.length; s++) {
        springs[s].k = p.k
        springs[s].kd = p.kd
      }
    }
    massSpringStep(state, activeSprings, world.msParams, dt)
  } else {
    if (grab.index >= 0) {
      // 位置ベース法では、つかんだ質点にポインタへ向かう速度を与える。位置を直接動かすと拘束を大きく破り、
      // 補正が裏返って網が絡まる。速度で向かわせれば、拘束で引き戻されて、届かない所には届かない
      const { pos, vel } = state
      const i = grab.index
      state.w[i] = 1 / NODE_MASS
      let vx = (grab.tx - pos[2 * i]) / dt
      let vy = (grab.ty - pos[2 * i + 1]) / dt
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed > GRAB_SPEED) {
        vx *= GRAB_SPEED / speed
        vy *= GRAB_SPEED / speed
      }
      vel[2 * i] = vx
      vel[2 * i + 1] = vy
    }
    // 位置ベース法は力を受け取らない。風の力 F は、速度に Δt·F/m を足して(前進オイラー法)から渡す
    if (p.windSpeed > 0) {
      state.force.fill(0)
      addWindForces(state, world.segments, world.wind, PLATE_DEPTH, AIR_DENSITY, p.CL, p.CD)
      const { vel, force, w } = state
      for (let i = 0; i < state.n; i++) {
        if (w[i] === 0) continue
        vel[2 * i] = advance(vel[2 * i], w[i] * force[2 * i], dt)
        vel[2 * i + 1] = advance(vel[2 * i + 1], w[i] * force[2 * i + 1], dt)
      }
    }
    const pp = world.pbdParams
    pp.iterations = p.iterations
    pp.damping = 1 - Math.exp(-AIR_RATE * dt) // 1 ステップで失う速度の割合(質点-ばね系の空気抵抗と同じ減り方)
    pbdStep(state, activeConstraints, pp, dt)
  }
  checkDiverged(world)
}

// ---- 表示用の数値 ----

// 質点 1 個とばね 1 本が半陰的オイラー法で安定な Δt の上限 2√(m/k) [s]
export function stableDt(k) {
  return criticalDt(NODE_MASS, k)
}

// この網全体の上限の目安 2/ω_max [s]。網は質点が多く、ばねの向きも違うので、ばね 1 本よりかなり小さい。
// ω_max² は、力のばね定数 k に対する変化(力の勾配)の最大の固有値 λ_max に k/m を掛けたもの。
// 自然長の網(固定なし。固定があると固有値は下がるだけなので、安全側)に小さな変位 u を与えたときの力から
// K·u = −(f(x+εu) − f(x))/ε を作り、冪乗法で λ_max(k = 1, m = 1 のとき)を求める。1 度だけ計算して使い回す
let latticeEigenvalue = 0
function computeLatticeEigenvalue() {
  const fresh = createCloth(COLS, ROWS, SPACING, 0, 0)
  const n = COLS * ROWS
  const state = createMassSpringState(n)
  state.pos.set(fresh.state.pos)
  const rest = new Float64Array(state.pos)
  const springs = fresh.constraints.map((c) => ({ i: c.i, j: c.j, k: 1, kd: 0, L0: c.d }))
  const u = new Float64Array(2 * n)
  const Ku = new Float64Array(2 * n)
  for (let i = 0; i < u.length; i++) u[i] = Math.sin(12.9898 * (i + 1)) // 決まった「でたらめ」な向きから始める
  const eps = 1e-6
  let lambda = 0
  for (let iter = 0; iter < 300; iter++) {
    let norm = 0
    for (let i = 0; i < u.length; i++) norm += u[i] * u[i]
    norm = Math.sqrt(norm)
    for (let i = 0; i < u.length; i++) {
      u[i] /= norm
      state.pos[i] = rest[i] + eps * u[i]
    }
    computeForces(state, springs, {})
    let dotUKu = 0
    for (let i = 0; i < u.length; i++) {
      Ku[i] = -state.force[i] / eps // 自然長では f(x) = 0
      dotUKu += u[i] * Ku[i]
    }
    lambda = dotUKu // 単位ベクトル u でのレイリー商
    u.set(Ku)
  }
  return lambda
}

// 減衰係数 kd があると、上限は小さくなる。減衰を速度の陽な項として入れる半陰的オイラー法では、
// 1 つの固有振動(角振動数 ω、減衰は力と同じ形で kd/k 倍)の安定の条件が ω²Δt² + 2(kd/k)ω²Δt ≤ 4 になる。
// β = kd/k とすると、Δt ≤ √(β² + (2/ω)²) − β(kd = 0 なら 2/ω)
export function latticeStableDt(k, kd = 0) {
  if (!latticeEigenvalue) latticeEigenvalue = computeLatticeEigenvalue()
  const dt0 = criticalDt(NODE_MASS, latticeEigenvalue * k)
  const beta = kd / k
  return Math.sqrt(beta * beta + dt0 * dt0) - beta
}

// 辺の自然長に対する伸びの最大値(縮みは含まない)。0.1 = 10 %。diagonals が false なら縦横の辺だけ見る
export function maxStretch(world, diagonals = true) {
  const { pos } = world.state
  const list = diagonals ? world.springs : world.structuralSprings
  let max = 0
  for (let s = 0; s < list.length; s++) {
    const { i, j, L0 } = list[s]
    const dx = pos[2 * j] - pos[2 * i]
    const dy = pos[2 * j + 1] - pos[2 * i + 1]
    const strain = (Math.sqrt(dx * dx + dy * dy) - L0) / L0
    if (strain > max) max = strain
  }
  return max
}
