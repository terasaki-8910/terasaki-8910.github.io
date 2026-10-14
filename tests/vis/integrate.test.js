import test from 'node:test'
import assert from 'node:assert/strict'
import { eulerStep, integrateEuler, integrateNewTime } from '../../src/utils/vis/integrate.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

test('eulerStep は x + Δt·u(t) をそのまま返す', () => {
  assert.equal(eulerStep(1, (t) => 3 * t, 2, 0.5), 1 + 0.5 * 6)
  assert.equal(eulerStep(-2, () => 4, 100, 0.25), -1)
})

test('n=1 の積分は x0 + T·u(0) になる', () => {
  assert.equal(integrateEuler((t) => 5 + t, 2, 3, 1), 2 + 3 * 5)
})

test('u=a の数値解は解析解 a·t+x0 と一致し、刻み幅によらない', () => {
  const a = 2
  const x0 = 1
  const T = 3
  for (const n of [1, 3, 7, 100, 1000]) {
    near(integrateEuler(() => a, x0, T, n), a * T + x0)
    near(integrateNewTime(() => a, x0, T, n), a * T + x0)
  }
})

test('u=at の誤差は a·T·Δt/2 で、Δt を半分にすると半分になる(a=2, T=3 で 0.9, 0.45, 0.225, 0.1125)', () => {
  const a = 2
  const T = 3
  const analytic = 0.5 * a * T * T
  const dts = [0.3, 0.15, 0.075, 0.0375]
  const errors = [10, 20, 40, 80].map((n) => analytic - integrateEuler((t) => a * t, 0, T, n))
  assert.deepEqual(errors.map((e) => round(e, 4)), [0.9, 0.45, 0.225, 0.1125])
  errors.forEach((e, i) => near(e, (a * T * dts[i]) / 2, 1e-9))
  for (let i = 0; i + 1 < errors.length; i++) near(errors[i] / errors[i + 1], 2, 1e-9)
})

test('u=at の数値解は解析解より小さい(古い時刻の速度を使うので増分を少なく見積もる)', () => {
  for (const n of [5, 25, 125]) {
    assert.ok(integrateEuler((t) => t, 0, 0.5, n) < 0.125)
  }
})

test('a=1, t=0.5 では Δt=0.1 で 0.100、Δt=0.02 で 0.120(解析解は 0.125)', () => {
  const u = (t) => t
  assert.equal(round(integrateEuler(u, 0, 0.5, 5), 3), 0.1)
  assert.equal(round(integrateEuler(u, 0, 0.5, 25), 3), 0.12)
  assert.equal(0.5 * 0.5 ** 2, 0.125)
})

test('u を新しい時刻で評価する形は 0.150 と 0.130 で、解析解との差は a·t·Δt/2 のまま向きだけが逆になる', () => {
  const u = (t) => t
  assert.equal(round(integrateNewTime(u, 0, 0.5, 5), 3), 0.15)
  assert.equal(round(integrateNewTime(u, 0, 0.5, 25), 3), 0.13)
  near(integrateNewTime(u, 0, 0.5, 5) - 0.125, (1 * 0.5 * 0.1) / 2, 1e-12)
  near(integrateNewTime(u, 0, 0.5, 25) - 0.125, (1 * 0.5 * 0.02) / 2, 1e-12)
  // 2 つの形の差は 1 ステップあたり a·Δt² で、全体では a·T·Δt(どちらの誤差の 2 倍)
  near(integrateNewTime(u, 0, 0.5, 5) - integrateEuler(u, 0, 0.5, 5), 0.5 * 0.1, 1e-12)
})

test('1 ステップの誤差は 1 次のテイラー展開で捨てた Δt²/2·x″(t) に一致し、Δt を 1/10 にすると 1/100 になる', () => {
  const x = (t) => Math.sin(t) * Math.exp(t)
  const u = (t) => Math.exp(t) * (Math.sin(t) + Math.cos(t)) // x′
  const xdd = (t) => 2 * Math.exp(t) * Math.cos(t) // x″
  const t = 0.7
  const stepError = (dt) => x(t + dt) - eulerStep(x(t), u, t, dt)
  const ratio = (dt) => stepError(dt) / (((dt * dt) / 2) * xdd(t))
  near(ratio(1e-2), 1, 1e-3)
  near(ratio(1e-3), 1, 1e-4)
  near(stepError(1e-2) / stepError(1e-3), 100, 0.2)
})

test('積み重ねた全体の誤差は Δt に比例する(dx/dt=e^t, x(0)=1 の x(1) で n を 2 倍にすると誤差が半分)', () => {
  const error = (n) => Math.E - integrateEuler(Math.exp, 1, 1, n)
  near(error(100) / error(200), 2, 5e-3)
  near(error(1000) / error(2000), 2, 5e-4)
  // 誤差の主要部は Δt/2·(u(T) - u(0)) = (e - 1)·Δt/2(Δt=1/n)
  near((error(1000) * 2000) / (Math.E - 1), 1, 2e-3)
})
