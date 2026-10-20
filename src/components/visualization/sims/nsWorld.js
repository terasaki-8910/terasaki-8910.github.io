import { addSplat2D } from '../../../utils/vis/grid.js'

export const N = 64
export const L = 1
export const DX = L / N
export const DT = 1 / 60
export const NU_MAX = 0.003
export const NU_DEFAULT = 0.0001
export const ITERATIONS = 60
const U = 0.5
const DELTA = 1 / 30
const EPSILON = 0.05

// 二重せん断層。速度と染料を、固定されたマスの中心に置く。
export function createWorld() {
  const u = new Float64Array(N * N)
  const v = new Float64Array(N * N)
  const dye = new Float64Array(N * N)
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * DX
    const profile = Math.tanh((y <= 0.5 ? y - 0.25 : 0.75 - y) / DELTA)
    for (let i = 0; i < N; i++) {
      const k = i + N * j
      u[k] = U * profile
      v[k] = EPSILON * U * Math.sin(2 * Math.PI * (i + 0.5) * DX)
      dye[k] = (profile + 1) / 2
    }
  }
  return { n: N, dx: DX, u, v, dye, time: 0, acc: 0 }
}

// ドラッグの速度 [m/s] に比例する局所的な押し。染料は描画時だけ 0〜1 に収める。
export function pushAt(world, x, y, fx, fy, strength) {
  addSplat2D(world.u, world.n, world.dx, x, y, 0.04, fx * strength)
  addSplat2D(world.v, world.n, world.dx, x, y, 0.04, fy * strength)
  addSplat2D(world.dye, world.n, world.dx, x, y, 0.04, Math.hypot(fx, fy) * strength)
}
