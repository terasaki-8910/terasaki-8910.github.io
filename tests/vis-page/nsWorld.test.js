import test from 'node:test'
import assert from 'node:assert/strict'
import { N, L, DX, DT, NU_MAX, NU_DEFAULT, ITERATIONS, createWorld, pushAt } from '../../src/components/visualization/sims/nsWorld.js'
import { fluidStep2D, divergence2D } from '../../src/utils/vis/grid.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)

test('NS: 64×64、1 m 四方、1/60 s、粘性の最大値でも陽解法の安定条件を満たす', () => {
  assert.equal(N, 64); assert.equal(L, 1); assert.equal(DX, 1 / 64); assert.equal(DT, 1 / 60)
  assert.equal(NU_MAX, 0.003)
  assert.ok(NU_MAX * DT / DX ** 2 <= 1 / 4)
})

test('NS: 二重せん断層の速度と滑らかな染料をマスの中心に置き、初期発散は 0', () => {
  const w = createWorld()
  for (const field of [w.u, w.v, w.dye]) {
    assert.ok(field instanceof Float64Array); assert.equal(field.length, N * N)
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const y = (j + 0.5) * DX, k = i + N * j
    const profile = Math.tanh((y <= 0.5 ? y - 0.25 : 0.75 - y) * 30)
    near(w.u[k], 0.5 * profile)
    near(w.v[k], 0.025 * Math.sin(2 * Math.PI * (i + 0.5) * DX))
    near(w.dye[k], (profile + 1) / 2)
    assert.ok(w.dye[k] >= 0 && w.dye[k] <= 1)
  }
  assert.ok(divergence2D(w.u, w.v, N, DX).every((x) => Math.abs(x) < 1e-12))
  const fresh = createWorld()
  w.u[0] = 99
  assert.notEqual(fresh.u[0], 99)
})

test('NS: 押した向きと強さで速度と染料を足し、格納した染料は 1 で切らない', () => {
  const a = createWorld(), b = createWorld(), initial = createWorld()
  pushAt(a, DX / 2, DX / 2, 2, -1, 1)
  pushAt(b, DX / 2, DX / 2, 2, -1, 0.5)
  near(a.u[0] - initial.u[0], 2); near(a.v[0] - initial.v[0], -1)
  assert.ok(a.dye[0] > 1)
  for (let k = 0; k < N * N; k++) {
    near(a.u[k] - initial.u[k], 2 * (b.u[k] - initial.u[k]))
    near(a.v[k] - initial.v[k], 2 * (b.v[k] - initial.v[k]))
  }
  near(a.u[1] - initial.u[1], a.u[N - 1] - initial.u[N - 1])
})

test('NS: 全体の状態で圧力 60 回は発散を減らし、120 ステップ後も全値が有限', () => {
  for (const nu of [0, NU_DEFAULT, NU_MAX]) {
    const w = createWorld()
    for (let step = 0; step < 120; step++) {
      if (step === 30) pushAt(w, 0.98, 0.5, 1, -0.5, 0.5)
      const result = fluidStep2D(w, { dt: DT, nu, iterations: ITERATIONS })
      if (step === 0) assert.ok(result.divergenceAfter / result.divergenceBefore < 0.1)
      for (const field of [w.u, w.v, w.dye]) assert.ok(field.every(Number.isFinite))
    }
  }
})
