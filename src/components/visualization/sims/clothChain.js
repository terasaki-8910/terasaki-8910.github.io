// 布の節の段階 6(鎖)と段階 9(位置ベース法の鎖)の世界(React にも DOM にも依存しない)。
// 上の端を固定して、おもり n 個をバネ(位置ベース法では距離の拘束)でつないで吊るす。
// 同じ質点の状態(pos・vel・w)を、質点-ばね系(半陰的オイラー法)と位置ベース法のどちらでも進められる。
// 計算は massSpring.js・pbd.js の関数だけを使い、ここは状態と、つかむ操作と、呼ぶ順番を持つ。
// 長さは m、x が右、y が上。質点 0 が固定された端で、1〜n が自由なおもり。
import { createMassSpringState, massSpringStep, springForce } from '../../../utils/vis/massSpring.js'
import { pbdStep } from '../../../utils/vis/pbd.js'

export const CHAIN_W = 2.4 // 描く範囲 [m]
export const CHAIN_H = 2.2
export const CHAIN_M = 0.1 // おもり 1 個の質量 [kg]
export const CHAIN_L0 = 0.2 // バネの自然長 [m]
export const CHAIN_G = 9.8 // 重力加速度 [m/s²]
export const AIR_RATE = 0.3 // 空気抵抗で速度が減る割合 [1/s]
export const PIN = [1.2, 2.1] // 固定した端の位置 [m]
const MAX_START_ANGLE = (60 * Math.PI) / 180
const START_HALF_WIDTH = 1.0 // 最初の鎖が固定の端から横へ出てよい長さ [m](描く範囲に収めるため)

// 最初に、真下から傾けて置く角度。長い鎖ほど小さくする(60° まで)
export function startAngle(n) {
  return Math.min(MAX_START_ANGLE, Math.asin(Math.min(1, START_HALF_WIDTH / (n * CHAIN_L0))))
}
export const GRAB_SPEED = 3 // つかんだおもりが手を追う速さの上限 [m/s]
const DIVERGE_LIMIT = 100 // これより遠くへ飛んだら、計算が発散したとみなす [m]
const SLACK = { springs: 0.4, pbd: 0.12 } // つかんで引いたとき、固定の端から届く距離に許す伸びの割合

const gravityVector = [0, -CHAIN_G]
const forceOut = [0, 0]

export function createChain({ n = 6, k = 200, kd = 0.3 } = {}) {
  const state = createMassSpringState(n + 1)
  state.w.fill(1 / CHAIN_M)
  state.w[0] = 0
  const angle = startAngle(n)
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  for (let i = 0; i <= n; i++) {
    state.pos[2 * i] = PIN[0] + i * CHAIN_L0 * sin
    state.pos[2 * i + 1] = PIN[1] - i * CHAIN_L0 * cos
  }
  const springs = []
  const constraints = []
  for (let i = 0; i < n; i++) {
    springs.push({ i, j: i + 1, k, kd, L0: CHAIN_L0 })
    constraints.push({ i, j: i + 1, d: CHAIN_L0 })
  }
  return {
    n,
    state,
    springs,
    constraints,
    k,
    kd,
    msParams: { gravity: gravityVector, drag: CHAIN_M * AIR_RATE, external: null },
    pbdParams: { gravity: gravityVector, iterations: 8, damping: 0, box: null },
    grab: { index: -1, tx: 0, ty: 0 },
    selected: n, // 力の矢印を描く質点(段階 6)
    diverged: false,
    positions0: new Float64Array(state.pos),
  }
}

export function resetChain(world) {
  const { state } = world
  state.pos.set(world.positions0)
  state.vel.fill(0)
  state.force.fill(0)
  if (state.pred) state.pred.set(world.positions0)
  state.w.fill(1 / CHAIN_M)
  state.w[0] = 0
  world.grab.index = -1
  world.diverged = false
}

// ---- つかむ ----

// (x, y) [m] から radius の中にあるいちばん近い、固定されていない質点をつかむ(質点の番号か -1)。固定した端はつかめない
export function nodeAt(world, x, y, radius) {
  const { pos } = world.state
  let best = -1
  let bestD2 = radius * radius
  for (let i = 1; i <= world.n; i++) {
    const dx = x - pos[2 * i]
    const dy = y - pos[2 * i + 1]
    const d2 = dx * dx + dy * dy
    if (d2 <= bestD2) {
      best = i
      bestD2 = d2
    }
  }
  return best
}

export function grabNode(world, x, y, radius) {
  const i = nodeAt(world, x, y, radius)
  if (i < 0) return false
  world.grab.index = i
  world.grab.tx = world.state.pos[2 * i]
  world.grab.ty = world.state.pos[2 * i + 1]
  world.selected = i
  return true
}

export function moveGrab(world, x, y) {
  if (world.grab.index < 0) return
  world.grab.tx = x
  world.grab.ty = y
}

export function releaseGrab(world) {
  const i = world.grab.index
  if (i < 0) return
  world.grab.index = -1
  world.state.w[i] = 1 / CHAIN_M
}

// 質点 i が固定の端から届く距離(自然長 × 段数 × (1 + 許す伸び))の円の中に、目標 (x, y) を収める
export function limitReach(world, i, x, y, method, out) {
  const reach = i * CHAIN_L0 * (1 + SLACK[method])
  const dx = x - PIN[0]
  const dy = y - PIN[1]
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d <= reach) {
    out[0] = x
    out[1] = y
  } else {
    out[0] = PIN[0] + (dx * reach) / d
    out[1] = PIN[1] + (dy * reach) / d
  }
  return out
}

const limited = [0, 0]

// 止まっているとき(再生していない)の表示用に、つかんだ質点を目標の位置へ直接動かす
export function snapGrab(world, method = 'springs') {
  const g = world.grab
  if (g.index < 0) return
  limitReach(world, g.index, g.tx, g.ty, method, limited)
  world.state.pos[2 * g.index] = limited[0]
  world.state.pos[2 * g.index + 1] = limited[1]
  world.state.vel[2 * g.index] = 0
  world.state.vel[2 * g.index + 1] = 0
}

// ---- 1 ステップ ----

function checkDiverged(world) {
  const { pos } = world.state
  for (let i = 0; i < pos.length; i++) {
    const v = pos[i]
    if (!(v > -DIVERGE_LIMIT && v < DIVERGE_LIMIT)) {
      world.diverged = true
      return
    }
  }
}

// 1 ステップ dt を進める。p = { method: 'springs' | 'pbd', k, kd, iterations }
export function stepChain(world, p, dt) {
  if (world.diverged) return
  const { state, grab } = world
  if (world.k !== p.k || world.kd !== p.kd) {
    world.k = p.k
    world.kd = p.kd
    for (const s of world.springs) {
      s.k = p.k
      s.kd = p.kd
    }
  }
  if (p.method === 'springs') {
    if (grab.index >= 0) {
      // 動かせない質点として扱い、目標の位置へ GRAB_SPEED·dt ずつ近づける
      const i = grab.index
      state.w[i] = 0
      limitReach(world, i, grab.tx, grab.ty, 'springs', limited)
      let dx = limited[0] - state.pos[2 * i]
      let dy = limited[1] - state.pos[2 * i + 1]
      const d = Math.sqrt(dx * dx + dy * dy)
      const max = GRAB_SPEED * dt
      if (d > max) {
        dx *= max / d
        dy *= max / d
      }
      state.pos[2 * i] += dx
      state.pos[2 * i + 1] += dy
      state.vel[2 * i] = 0
      state.vel[2 * i + 1] = 0
    }
    massSpringStep(state, world.springs, world.msParams, dt)
  } else {
    if (grab.index >= 0) {
      // 位置を直接動かすと拘束を大きく破るので、目標へ向かう速度を与える(拘束で引き戻されるので、届かない所には届かない)
      const i = grab.index
      state.w[i] = 1 / CHAIN_M
      limitReach(world, i, grab.tx, grab.ty, 'pbd', limited)
      let vx = (limited[0] - state.pos[2 * i]) / dt
      let vy = (limited[1] - state.pos[2 * i + 1]) / dt
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed > GRAB_SPEED) {
        vx *= GRAB_SPEED / speed
        vy *= GRAB_SPEED / speed
      }
      state.vel[2 * i] = vx
      state.vel[2 * i + 1] = vy
    }
    const pp = world.pbdParams
    pp.iterations = p.iterations
    pp.damping = 1 - Math.exp(-AIR_RATE * dt) // 質点-ばね系の空気抵抗と同じ減り方
    pbdStep(state, world.constraints, pp, dt)
  }
  checkDiverged(world)
}

// ---- 表示用の数値 ----

// 自然長に対する伸びの最大(縮みは含まない)。0.1 = 10 %
export function maxChainStretch(world) {
  const { pos } = world.state
  let max = 0
  for (const { i, j, L0 } of world.springs) {
    const dx = pos[2 * j] - pos[2 * i]
    const dy = pos[2 * j + 1] - pos[2 * i + 1]
    const strain = (Math.sqrt(dx * dx + dy * dy) - L0) / L0
    if (strain > max) max = strain
  }
  return max
}

// 質点 i (1〜n)が受ける力 [N]: 重力 mg、上のバネの力、下のバネの力(いちばん下の質点は下のバネがない)と、その和。
// バネの力は springForce(massSpring.js)で求める。空気抵抗は小さいので入れない
export function nodeForces(world, i) {
  const { p, v } = world.state
  const s = world.springs
  const out = {
    gravity: [0, -CHAIN_M * CHAIN_G],
    above: [0, 0],
    below: [0, 0],
    total: [0, 0],
  }
  const up = s[i - 1] // 質点 i - 1 と i をつなぐバネ
  springForce(p[i], p[i - 1], v[i], v[i - 1], up.k, up.kd, up.L0, forceOut)
  out.above[0] = forceOut[0]
  out.above[1] = forceOut[1]
  if (i < world.n) {
    const down = s[i]
    springForce(p[i], p[i + 1], v[i], v[i + 1], down.k, down.kd, down.L0, forceOut)
    out.below[0] = forceOut[0]
    out.below[1] = forceOut[1]
  }
  for (let c = 0; c < 2; c++) out.total[c] = out.gravity[c] + out.above[c] + out.below[c]
  return out
}

// キーボードの代わりのつかみ方: 質点 i(0 を渡すと固定でない全部)に速度 (dvx, dvy) [m/s] を足して揺らす
export function nudge(world, dvx, dvy, i = 0) {
  const { vel } = world.state
  for (let j = i || 1; j <= (i || world.n); j++) {
    if (j === world.grab.index) continue // つかんでいる質点は手が決める
    vel[2 * j] += dvx
    vel[2 * j + 1] += dvy
  }
}
