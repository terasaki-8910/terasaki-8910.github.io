// 段階 2〜5・7 の小さなシミュレーションが使う「粒子の小さな塊(patch)」。React に依存しない。
// 計算は utils/vis/sph.js の関数だけを使い、ここでは式を書き直さない(密度・圧力・力は sphStep の中、
// 1 組の力は computeForces を 2 粒子の状態に対して呼んで求める)。
// 長さは m。領域の左下が原点で y は上向き。粒子は cols × rows の正方格子(間隔 spacing)に並べる。
//   patch = { state, params, n, cols, rows, width, height, spacing, selected, grab, nbr }
//   patch.selected  調べている粒子の番号(h の円と近傍を見せる)
//   patch.grab      つかんでいる粒子 { index, x, y, vx, vy, t }(動かしているあいだ、その粒子は手の位置に留め、
//                   手の速度 (vx, vy) で動いているものとして、まわりの粒子に力を及ぼす。手が止まって STALE_MS 経ったら速度は 0)

import {
  createSphState,
  fillBlock,
  sphStep,
  sphMaxDt,
  defaultSphParams,
  restDensity,
  neighborsAt,
  computeForces,
  poly6,
  UniformGrid,
} from '../../../utils/vis/sph.js'
import { SP } from './fluidKit.js'

export const BASE = defaultSphParams(SP)
export const STALE_MS = 80 // 手を止めてからこの時間が経ったら、手の速度は 0

// cols × rows の格子の patch を作る。params で BASE を上書きする(重力は 0。必要なら gravity を渡す)。
// cell は近傍探索のセルの 1 辺(省略すると h。h を変える段階では、最大の h を渡す)
export function createPatch({ cols, rows, width, height, spacing = SP, params = {}, cell }) {
  const n = cols * rows
  const merged = { ...BASE, gravity: [0, 0], stir: null, ...params }
  const state = createSphState(n, width, height, cell ?? merged.h)
  const patch = {
    state,
    params: merged,
    n,
    cols,
    rows,
    width,
    height,
    spacing,
    selected: Math.floor(rows / 2) * cols + Math.floor(cols / 2),
    grab: null,
    nbr: new Int32Array(n),
    mini: null,
    time: 0, // 動かしてからの時刻 [s](advancePatch が進める)
  }
  layoutLattice(patch, spacing)
  return patch
}

// 格子を間隔 spacing で並べ直す(速度は 0)。anchor は 'center'(領域の中央)か 'corner'(左下の隅)
export function layoutLattice(patch, spacing = patch.spacing, anchor = patch.anchor ?? 'center') {
  const { state, cols, rows, width, height } = patch
  patch.anchor = anchor
  const x0 = anchor === 'corner' ? 0 : (width - cols * spacing) / 2
  const y0 = anchor === 'corner' ? 0 : (height - rows * spacing) / 2
  fillBlock(state, x0, y0, cols, rows, spacing)
  state.force.fill(0)
  patch.spacing = spacing
  patch.grab = null
  patch.time = 0
  settle(patch)
}

// 動かさずに、近傍・密度・圧力・力だけを最新にする(sphStep の dt = 0)
export function settle(patch) {
  sphStep(patch.state, patch.params, 0)
}

// h を変える。休止密度 ρ0 は、間隔 SP の格子の密度にそろえる(そうしないと、並べただけで圧力がかかる)
export function setSmoothing(patch, h) {
  patch.params.h = h
  patch.params.rho0 = restDensity(patch.params.m, h, SP)
}

// 粒子 i を (x, y) に置く(領域の中に収める。速度は 0)
export function moveParticle(patch, i, x, y) {
  const { pos, vel } = patch.state
  pos[2 * i] = Math.min(patch.width, Math.max(0, x))
  pos[2 * i + 1] = Math.min(patch.height, Math.max(0, y))
  vel[2 * i] = 0
  vel[2 * i + 1] = 0
}

// 点 (x, y) に一番近い粒子の番号(maxDist より遠ければ -1)
export function nearestParticle(patch, x, y, maxDist = Infinity) {
  const { pos } = patch.state
  let best = -1
  let bestD = maxDist * maxDist
  for (let i = 0; i < patch.n; i++) {
    const dx = pos[2 * i] - x
    const dy = pos[2 * i + 1] - y
    const d2 = dx * dx + dy * dy
    if (d2 <= bestD) {
      bestD = d2
      best = i
    }
  }
  return best
}

// 粒子 i から h より近い粒子の番号を patch.nbr に詰めて、個数を返す(settle のあとに呼ぶ)
export function neighborsOf(patch, i) {
  const { state, params } = patch
  return neighborsAt(state.grid, state.pos, state.pos[2 * i], state.pos[2 * i + 1], params.h, patch.nbr, i)
}

// i から一番近い粒子の番号(自分以外。ほかに粒子がなければ -1)
export function closestTo(patch, i) {
  const { pos } = patch.state
  let best = -1
  let bestD = Infinity
  for (let j = 0; j < patch.n; j++) {
    if (j === i) continue
    const d = (pos[2 * j] - pos[2 * i]) ** 2 + (pos[2 * j + 1] - pos[2 * i + 1]) ** 2
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

// 粒子 i の密度の内訳: 自分の分 m·W(0)、近くの粒子の分(合計)、個数。settle のあとに呼ぶ
export function densityParts(patch, i) {
  const { m, h } = patch.params
  const self = m * poly6(0, h)
  const rho = patch.state.rho[i]
  return { self, others: rho - self, rho, count: neighborsOf(patch, i) }
}

// 組 (i, j) で粒子 i が j から受ける力(圧力と粘性。patch.params の mu・k による)。粒子 j が i から受ける力はこの逆。
// 密度・圧力・速度は patch.state の今の値を使い、2 粒子だけの状態に対して computeForces を呼ぶ
//   only: 'pressure' なら圧力の力だけ、'viscosity' なら粘性の力だけ(省略すると両方)
export function pairForce(patch, i, j, only) {
  const { state, params } = patch
  const mini =
    patch.mini ??
    (patch.mini = {
      n: 2,
      pos: new Float64Array(4),
      vel: new Float64Array(4),
      force: new Float64Array(4),
      rho: new Float64Array(2),
      pressure: new Float64Array(2),
      grid: { pairCount: 1, pairs: Int32Array.of(0, 1) },
    })
  for (const [slot, p] of [[0, i], [1, j]]) {
    mini.pos[2 * slot] = state.pos[2 * p]
    mini.pos[2 * slot + 1] = state.pos[2 * p + 1]
    mini.vel[2 * slot] = state.vel[2 * p]
    mini.vel[2 * slot + 1] = state.vel[2 * p + 1]
    mini.rho[slot] = state.rho[p]
    mini.pressure[slot] = only === 'viscosity' ? 0 : state.pressure[p]
  }
  computeForces(mini, only === 'pressure' ? { ...params, mu: 0 } : params)
  return [mini.force[0], mini.force[1]]
}

// 粒子 i が近くの全粒子から受ける力の合計(only は pairForce と同じ)。settle か sphStep のあとに呼ぶ
export function summedPairForce(patch, i, only) {
  const count = neighborsOf(patch, i)
  let fx = 0
  let fy = 0
  for (let q = 0; q < count; q++) {
    const [x, y] = pairForce(patch, i, patch.nbr[q], only)
    fx += x
    fy += y
  }
  return [fx, fy]
}

// 全粒子の力の合計(運動量が保存するので、ほぼ 0)
export function forceSum(patch) {
  const { force } = patch.state
  let fx = 0
  let fy = 0
  for (let i = 0; i < patch.n; i++) {
    fx += force[2 * i]
    fy += force[2 * i + 1]
  }
  return [fx, fy]
}

// 1 ステップ進める。つかんでいる粒子は手の位置に留める(力を受けても動かない)
export function stepPatch(patch, dt) {
  pinGrab(patch)
  sphStep(patch.state, patch.params, dt)
  pinGrab(patch)
}

function pinGrab(patch) {
  const g = patch.grab
  if (!g) return
  moveParticle(patch, g.index, g.x, g.y)
  if (g.t !== undefined && Date.now() - g.t < STALE_MS) {
    patch.state.vel[2 * g.index] = g.vx
    patch.state.vel[2 * g.index + 1] = g.vy
  }
}

// 1 フレーム(frameDt 秒)を、Δt = scale × sphMaxDt のステップに分けて進める。進めたステップの数を返す
export function advancePatch(patch, frameDt, scale = 1) {
  const dt = sphMaxDt(patch.params) * scale
  const steps = Math.max(1, Math.round(Math.min(frameDt, 1 / 30) / dt))
  for (let s = 0; s < steps; s++) stepPatch(patch, dt)
  patch.time += steps * dt
  return { steps, dt }
}

// 粒子 n 個を領域に(種を固定した乱数で)ばらまく。端から margin 内側のあいだ。cols = n・rows = 1 の patch に使う
export function scatter(patch, seed = 7, margin = 0.015) {
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
  const { pos, vel } = patch.state
  for (let i = 0; i < patch.n; i++) {
    pos[2 * i] = margin + rand() * (patch.width - 2 * margin)
    pos[2 * i + 1] = margin + rand() * (patch.height - 2 * margin)
    vel[2 * i] = 0
    vel[2 * i + 1] = 0
  }
  patch.grab = null
  patch.time = 0
  patch.selected = nearestParticle(patch, patch.width / 2, patch.height / 2)
  settle(patch)
}

// 近傍探索のセルの 1 辺を cell にする(グリッドを作り直す。cell は h 以上)
export function setCell(patch, cell) {
  patch.state.grid = new UniformGrid(patch.width, patch.height, Math.max(cell, patch.params.h), patch.n)
  settle(patch)
}

// 上半分の行の x 速度を +v、下半分を −v にする(速度の違う粒子の層。粘性の段階の初期状態)
export function setShear(patch, v) {
  const { vel } = patch.state
  for (let i = 0; i < patch.n; i++) {
    const row = Math.floor(i / patch.cols)
    vel[2 * i] = row >= patch.rows / 2 ? v : -v
    vel[2 * i + 1] = 0
  }
  settle(patch)
}

// 上の層と下の層の x 速度の平均
export function layerMeans(patch) {
  const { vel } = patch.state
  let up = 0
  let lo = 0
  let nu = 0
  let nl = 0
  for (let i = 0; i < patch.n; i++) {
    if (Math.floor(i / patch.cols) >= patch.rows / 2) {
      up += vel[2 * i]
      nu++
    } else {
      lo += vel[2 * i]
      nl++
    }
  }
  return { upper: nu ? up / nu : 0, lower: nl ? lo / nl : 0 }
}

// 最大の速さ
export function maxSpeed(patch) {
  const { vel } = patch.state
  let m = 0
  for (let i = 0; i < patch.n; i++) m = Math.max(m, Math.hypot(vel[2 * i], vel[2 * i + 1]))
  return m
}
