// NS の段階の初期条件・操作・進行。方程式の更新は utils/vis/grid.js に任せる。
import {
  addSplat2D,
  advectSemiLagrangian1D,
  advectUpwind1D,
  diffuse1D,
  divergence2D,
  projectPeriodic2D,
  fluidSubstep2D,
} from '../../../utils/vis/grid.js'
import { createWorld, pushAt, DT, NU_DEFAULT, ITERATIONS } from './nsWorld.js'

export const CELLS = 40
export const DX1 = 1 / CELLS
export const STEP_N = 32
export const FORCE_RADIUS = 0.06
export const STAGES = ['外力', '移流', '粘性', '圧力']
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
export const cellAt = (x, n = CELLS) => clamp(Math.floor(x * n), 0, n - 1)
export const cellX = (i) => (i + 0.5) * DX1
export const maxAbs = (values) => values.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
export const hasBlownUp = (values) => values.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6)
export const pulseBounds = (c, t = 0) => (c < 0 ? [0.65, 0.85] : [0.15, 0.35]).map((x) => x + c * t)
export const pulseHasLeft = (c, t) => {
  const [left, right] = pulseBounds(c, t)
  return left >= 1 || right <= 0
}
export function exactPulse(c, t) {
  const [left, right] = pulseBounds(c, t)
  return [
    [Math.min(0, left), 0],
    [left, 0],
    [left, 1],
    [right, 1],
    [right, 0],
    [Math.max(1, right), 0],
  ]
}

export function createLine(kind, c = 0.5) {
  const [left, right] = kind === 'advect' ? pulseBounds(c) : [0.4, 0.6]
  const values = Float64Array.from({ length: CELLS }, (_, i) => +(cellX(i) >= left && cellX(i) <= right))
  return { values, out: new Float64Array(CELLS), time: 0, acc: 0, diverged: false, selected: 20 }
}

// さかのぼった点の両側(端では同じ点)。風上差分は自分と風上の点。
export function probeCells(i, c, dt, method) {
  const back = cellX(i) - c * dt
  if (method === 'upwind') return { back, cells: [i, clamp(i - Math.sign(c), 0, CELLS - 1)] }
  const index = clamp(i - (c * dt) / DX1, 0, CELLS - 1)
  const left = Math.floor(index)
  return { back, cells: [left, Math.min(CELLS - 1, left + 1)] }
}

// 実時間をためてから Δt ごとに進める。発散したフレームを残し、それ以降はリセットまで止める。
export function advanceLine(w, elapsed, { kind, c = 0.5, dt = DT, nu = 0.005, method = 'semi' }) {
  if (w.diverged) return
  w.acc += elapsed
  while (w.acc + 1e-12 >= dt && !w.diverged) {
    if (kind === 'advect') {
      const advect = method === 'semi' ? advectSemiLagrangian1D : advectUpwind1D
      advect(w.values, c, DX1, dt, w.out)
    } else diffuse1D(w.values, nu, DX1, dt, w.out)
    ;[w.values, w.out] = [w.out, w.values]
    w.time += dt
    w.acc = Math.max(0, w.acc - dt)
    w.diverged = hasBlownUp(w.values)
    if (!w.diverged && kind === 'advect' && pulseHasLeft(c, w.time)) {
      const fresh = createLine(kind, c)
      w.values.set(fresh.values)
      w.time = 0
    }
  }
}

// 速いドラッグでも通り過ぎたマスを塗り残さない。
export function paintLine(w, from, to) {
  if (w.diverged) return
  const first = cellAt(from.x),
    last = cellAt(to.x)
  for (let i = Math.min(first, last); i <= Math.max(first, last); i++) {
    const a = first === last ? 1 : clamp((cellX(i) - from.x) / (to.x - from.x), 0, 1)
    w.values[i] = clamp(from.y + a * (to.y - from.y), -1, 1.5)
  }
  w.selected = last
}

export function emptyField() {
  return { n: STEP_N, dx: 1 / STEP_N, u: new Float64Array(STEP_N ** 2), v: new Float64Array(STEP_N ** 2) }
}

// 押したマスの中心に力を置き、静止した押しでは中心の増分が正確に F·t_p となる。
export function forcePoint(x, y) {
  const i = cellAt(x, STEP_N),
    j = cellAt(y, STEP_N)
  return { x: (i + 0.5) / STEP_N, y: (j + 0.5) / STEP_N, k: i + STEP_N * j }
}
export function applyForce(w, point, F, direction = [1, 0]) {
  const length = Math.hypot(...direction)
  const [fx, fy] = length ? direction.map((x) => x / length) : [1, 0]
  addSplat2D(w.u, w.n, w.dx, point.x, point.y, FORCE_RADIUS, DT * F * fx)
  addSplat2D(w.v, w.n, w.dx, point.x, point.y, FORCE_RADIUS, DT * F * fy)
}

export function recomputePressure(w, iterations) {
  w.after = { ...w.before, u: w.before.u.slice(), v: w.before.v.slice() }
  const result = projectPeriodic2D(w.after.u, w.after.v, STEP_N, 1 / STEP_N, iterations, 0)
  w.q = result.q
  w.iterations = result.iterations
  w.divBefore = divergence2D(w.before.u, w.before.v, STEP_N, 1 / STEP_N)
  w.divAfter = divergence2D(w.after.u, w.after.v, STEP_N, 1 / STEP_N)
  w.correction = {
    ...w.before,
    u: w.after.u.map((x, k) => x - w.before.u[k]),
    v: w.after.v.map((x, k) => x - w.before.v[k]),
  }
}
export function createPressure(iterations = 60) {
  const before = emptyField()
  addSplat2D(before.u, STEP_N, before.dx, 0.5, 0.5, 0.1, 1)
  const w = { before }
  // 尺度は初期状態の 60 回から固定し、反復回数やドラッグで変えない。
  recomputePressure(w, 60)
  w.divScale = maxAbs(w.divBefore)
  w.qScale = maxAbs(w.q)
  if (iterations !== 60) recomputePressure(w, iterations)
  return w
}
export function pushPressure(w, x, y, fx, fy, iterations) {
  addSplat2D(w.before.u, STEP_N, 1 / STEP_N, x, y, 0.1, fx)
  addSplat2D(w.before.v, STEP_N, 1 / STEP_N, x, y, 0.1, fy)
  recomputePressure(w, iterations)
}

export function createSplit() {
  return {
    field: createWorld({ n: STEP_N }),
    cursor: 0,
    steps: 0,
    acc: 0,
    pending: [],
    delta: emptyField(),
    maxDelta: 0,
  }
}
export function stepSplit(w) {
  const { field, delta } = w
  delta.u.set(field.u)
  delta.v.set(field.v)
  if (w.cursor === 0) {
    for (const p of w.pending) pushAt(field, p.x, p.y, p.fx, p.fy, 0.2)
    w.pending = []
  } else {
    fluidSubstep2D(field, { dt: DT, nu: NU_DEFAULT, iterations: ITERATIONS }, ['force', 'advect', 'diffuse', 'project'][w.cursor])
  }
  w.maxDelta = 0
  for (let k = 0; k < field.u.length; k++) {
    delta.u[k] = field.u[k] - delta.u[k]
    delta.v[k] = field.v[k] - delta.v[k]
    w.maxDelta = Math.max(w.maxDelta, Math.hypot(delta.u[k], delta.v[k]))
  }
  w.cursor = (w.cursor + 1) % STAGES.length
  if (w.cursor === 0) w.steps++
  field.time = w.steps * DT
}

export function advanceSplit(w, elapsed) {
  w.acc += elapsed
  while (w.acc + 1e-12 >= 1 / 8) {
    stepSplit(w)
    w.acc = Math.max(0, w.acc - 1 / 8)
  }
}
