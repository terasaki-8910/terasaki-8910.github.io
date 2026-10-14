import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachViews,
  createMassSpringState,
  springForce,
  computeForces,
  massSpringStep,
  massSpringStepExplicit,
  criticalDt,
  massSpringEnergy,
  aeroForce,
  addWindForces,
} from '../../src/utils/vis/massSpring.js'
import { integrateEuler, integrateNewTime } from '../../src/utils/vis/integrate.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0
// 有効数字 n 桁に丸める
const sig = (x, n) => Number(x.toPrecision(n))

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const totalEnergy = (state, springs) => {
  const { kinetic, elastic } = massSpringEnergy(state, springs)
  return kinetic + elastic
}

// 固定点(原点)に質量 m の質点を 1 本のばねでつないだ系。質点は (L0 + stretch, 0) から静かに放す。
// 自然長 L0=0 なら力は F=-kx の線形ばね(原点を通り抜けても向きが反転するだけ)
function oscillator(k, m, { stretch = 1, L0 = 0, kd = 0 } = {}) {
  const state = createMassSpringState(2)
  state.w[0] = 0
  state.w[1] = 1 / m
  state.pos[2] = L0 + stretch
  return { state, springs: [{ i: 0, j: 1, k, kd, L0 }] }
}

// steps ステップ進める間の最大エネルギーが、初めのエネルギーの何倍か
function maxEnergyRatio(step, k, steps, { m = 1, dt = 0.01 } = {}) {
  const { state, springs } = oscillator(k, m)
  const initial = totalEnergy(state, springs)
  let top = 0
  for (let s = 0; s < steps; s++) {
    step(state, springs, {}, dt)
    top = Math.max(top, totalEnergy(state, springs))
  }
  return top / initial
}

// 両端を固定した N 個の質点の鎖(質点 0 と N+1 が固定)。x 軸上に間隔 a で並べる
function fixedChain(N, k, m, a = 1) {
  const state = createMassSpringState(N + 2)
  for (let i = 0; i <= N + 1; i++) state.pos[2 * i] = i * a
  state.w[0] = 0
  state.w[N + 1] = 0
  for (let i = 1; i <= N; i++) state.w[i] = 1 / m
  const springs = []
  for (let i = 0; i <= N; i++) springs.push({ i, j: i + 1, k, kd: 0, L0: a })
  return { state, springs }
}

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

test('createMassSpringState: p[i]・v[i]・f[i] は pos・vel・force の同じメモリを指し、質量はすべて 1', () => {
  const state = createMassSpringState(3)
  assert.equal(state.n, 3)
  assert.equal(state.pos.length, 6)
  assert.deepEqual(Array.from(state.w), [1, 1, 1])
  state.p[2][0] = 5
  state.p[2][1] = -6
  state.v[1][1] = 7
  state.f[0][0] = 8
  assert.deepEqual(Array.from(state.pos), [0, 0, 0, 0, 5, -6])
  assert.deepEqual(Array.from(state.vel), [0, 0, 0, 7, 0, 0])
  assert.deepEqual(Array.from(state.force), [8, 0, 0, 0, 0, 0])
  state.pos[0] = 1.5
  assert.equal(state.p[0][0], 1.5)
  assert.ok(state.pos instanceof Float64Array && state.p[0] instanceof Float64Array)
})

test('pos・vel・w だけの状態(位置ベース法の状態など)でも使え、足りない force と view を最初の呼び出しで足す', () => {
  const state = { n: 2, pos: new Float64Array([0, 0, 1.5, 0]), vel: new Float64Array(4), w: new Float64Array([0, 1]) }
  assert.equal(state.p, undefined)
  massSpringStep(state, [{ i: 0, j: 1, k: 100, kd: 0, L0: 1 }], { gravity: [0, -9.8] }, 0.01)
  assert.equal(state.p.length, 2)
  assert.equal(state.force.length, 4)
  assert.equal(round(state.vel[2], 9), -0.5) // F = -k·0.5 = -50 → v = -0.5
  assert.equal(round(state.vel[3], 9), -0.098)
  assert.equal(round(state.pos[2], 9), 1.495)
  const views = state.p
  massSpringStep(state, [], {}, 0.01)
  assert.equal(state.p, views) // 2 回目以降は作り直さない
  assert.equal(attachViews(state), state)
  // n がなくても w の長さから決まる
  const bare = { pos: new Float64Array(6), vel: new Float64Array(6), w: new Float64Array(3).fill(1) }
  assert.equal(attachViews(bare).n, 3)
})

// ---------------------------------------------------------------------------
// ばねの力
// ---------------------------------------------------------------------------

test('springForce: 伸びていれば p1 を p2 の向きに、縮んでいれば逆向きに、大きさ k|L-L0| で引く', () => {
  const zero = [0, 0]
  // p1=(0,0), p2=(3,4): L=5, n=(0.6,0.8)
  assert.deepEqual(springForce([0, 0], [3, 4], zero, zero, 10, 0, 3).map((q) => round(q, 9)), [12, 16])
  assert.deepEqual(springForce([0, 0], [3, 4], zero, zero, 10, 0, 7).map((q) => round(q, 9)), [-12, -16])
  assert.deepEqual(springForce([0, 0], [3, 4], zero, zero, 10, 0, 5), [0, 0]) // 自然長なら力は 0
})

test('springForce: p2 にかかる力は p1 の力と逆向きで大きさが同じ(作用反作用)', () => {
  const rng = makeRng(71)
  for (let trial = 0; trial < 200; trial++) {
    const p1 = [rng() * 4 - 2, rng() * 4 - 2]
    const p2 = [rng() * 4 - 2, rng() * 4 - 2]
    const v1 = [rng() * 2 - 1, rng() * 2 - 1]
    const v2 = [rng() * 2 - 1, rng() * 2 - 1]
    const F1 = springForce(p1, p2, v1, v2, 30, 2, 1)
    const F2 = springForce(p2, p1, v2, v1, 30, 2, 1)
    near(F1[0], -F2[0], 1e-12)
    near(F1[1], -F2[1], 1e-12)
  }
})

test('springForce: 減衰はばねの向きの相対速度に比例し、垂直な相対速度や同じ速度の並進では 0', () => {
  const p1 = [0, 0]
  const p2 = [3, 4] // n = (0.6, 0.8)、自然長のまま(ばねの力は 0)
  const rest = 5
  // 離れていく向きの相対速度 s=2: 力は p1 を p2 の側へ kd·s の大きさで引き戻す
  const away = springForce(p1, p2, [0, 0], [1.2, 1.6], 10, 3, rest)
  assert.deepEqual(away.map((q) => round(q, 9)), [3.6, 4.8])
  // 相対速度がばねに垂直(0.8, -0.6)なら 0
  const perp = springForce(p1, p2, [0, 0], [0.8, -0.6], 10, 3, rest)
  assert.deepEqual(perp.map((q) => round(q, 9)), [0, 0])
  // 2 つが同じ速度で動いていれば 0
  const together = springForce(p1, p2, [5, -2], [5, -2], 10, 3, rest)
  assert.deepEqual(together.map((q) => round(q, 9)), [0, 0])
})

test('springForce: 全体を回転させると力も同じ角度だけ回る(向きによらない)', () => {
  const rng = makeRng(72)
  const rotate = (v, c, s) => [c * v[0] - s * v[1], s * v[0] + c * v[1]]
  for (let trial = 0; trial < 100; trial++) {
    const th = rng() * 2 * Math.PI
    const c = Math.cos(th)
    const s = Math.sin(th)
    const p1 = [rng() * 4 - 2, rng() * 4 - 2]
    const p2 = [rng() * 4 - 2, rng() * 4 - 2]
    const v1 = [rng() * 2 - 1, rng() * 2 - 1]
    const v2 = [rng() * 2 - 1, rng() * 2 - 1]
    const F = springForce(p1, p2, v1, v2, 20, 1.5, 0.7)
    const Fr = springForce(rotate(p1, c, s), rotate(p2, c, s), rotate(v1, c, s), rotate(v2, c, s), 20, 1.5, 0.7)
    const expected = rotate(F, c, s)
    near(Fr[0], expected[0], 1e-11)
    near(Fr[1], expected[1], 1e-11)
  }
})

test('springForce: out に書き込んで返し、長さ 0 のばねでも NaN にならず力は 0', () => {
  const out = [9, 9]
  const result = springForce([0, 0], [3, 4], [0, 0], [0, 0], 10, 0, 3, out)
  assert.equal(result, out)
  assert.equal(round(out[0], 9), 12)
  assert.deepEqual(springForce([1, 1], [1, 1], [0, 0], [1, 0], 10, 5, 0), [0, 0])
})

// ---------------------------------------------------------------------------
// 1 ステップ(質点 1 個・ばね 1 本)
// ---------------------------------------------------------------------------

test('m=1, k=100, Δt=0.01, 伸び 0.1 から: 1 ステップ目は F=-10、v=-0.1、x=0.099(古い速度なら x=0.1 のまま)', () => {
  const { state, springs } = oscillator(100, 1, { stretch: 0.1 })
  computeForces(state, springs, {})
  assert.equal(round(state.f[1][0], 9), -10) // F = -k x
  assert.equal(round(state.f[0][0], 9), 10) // 固定点にかかる反力
  massSpringStep(state, springs, {}, 0.01)
  assert.equal(round(state.vel[2], 9), -0.1)
  assert.equal(round(state.pos[2], 9), 0.099)
  const explicit = oscillator(100, 1, { stretch: 0.1 })
  massSpringStepExplicit(explicit.state, explicit.springs, {}, 0.01)
  assert.equal(round(explicit.state.pos[2], 9), 0.1) // 1 ステップ遅れる
  assert.equal(round(explicit.state.vel[2], 9), -0.1)
})

test('m=1, k=100, Δt=0.01, 伸び 0.1: n=0〜3 の値、16 ステップ目に自然長を通り過ぎ、t=0.03 で解析解 0.1cos(10t) との差は 0.00148', () => {
  const { state, springs } = oscillator(100, 1, { stretch: 0.1 })
  const xs = [state.pos[2]]
  const vs = [state.vel[2]]
  for (let s = 0; s < 20; s++) {
    massSpringStep(state, springs, {}, 0.01)
    xs.push(state.pos[2])
    vs.push(state.vel[2])
  }
  assert.deepEqual(xs.slice(0, 4).map((q) => round(q, 7)), [0.1, 0.099, 0.09701, 0.0940499])
  assert.deepEqual(vs.slice(0, 4).map((q) => round(q, 5)), [0, -0.1, -0.199, -0.29601])
  assert.ok(xs[15] > 0 && xs[16] < 0)
  assert.equal(round(xs[16], 7), -0.0079907)
  const analytic = 0.1 * Math.cos(10 * 0.03)
  assert.equal(round(analytic, 7), 0.0955336)
  assert.equal(round(analytic - xs[3], 7), 0.0014837)
  assert.equal(round((analytic - xs[3]) / analytic, 3), 0.016) // 1.55 %
  assert.equal(round(Math.PI / 20, 5), 0.15708) // 解析解が最初に 0 を通る時刻
})

test('ばね 1 本の誤差は Δt に比例する(t=0.03 で Δt=0.01 → 0.00148、Δt を半分にすると約半分)', () => {
  const error = (dt) => {
    const { state, springs } = oscillator(100, 1, { stretch: 0.1 })
    for (let s = 0; s < Math.round(0.03 / dt); s++) massSpringStep(state, springs, {}, dt)
    return 0.1 * Math.cos(10 * 0.03) - state.pos[2]
  }
  assert.equal(round(error(0.01), 5), 0.00148)
  assert.equal(round(error(0.005), 5), 0.00074)
  const ratio = error(0.005) / error(0.01)
  assert.ok(ratio > 0.45 && ratio < 0.55)
})

// ---------------------------------------------------------------------------
// エネルギー: 半陰的オイラー法と前進オイラー法
// ---------------------------------------------------------------------------

test('k=100, m=1, Δt=0.01, 4000 ステップで、前進オイラーは最大エネルギーが初めの 1.93e17 倍、半陰的は 1.0526 倍', () => {
  const semi = maxEnergyRatio(massSpringStep, 100, 4000)
  const explicit = maxEnergyRatio(massSpringStepExplicit, 100, 4000)
  assert.equal(round(semi, 4), 1.0526)
  assert.equal(sig(explicit, 3), 1.93e17)
})

test('前進オイラーはエネルギーが毎ステップちょうど (1 + k·Δt²/m) = 1.01 倍になる', () => {
  const { state, springs } = oscillator(100, 1)
  let previous = totalEnergy(state, springs)
  for (let s = 0; s < 200; s++) {
    massSpringStepExplicit(state, springs, {}, 0.01)
    const energy = totalEnergy(state, springs)
    near(energy / previous, 1.01, 1e-9)
    previous = energy
  }
  // 質量が違っても Δt²·k/m で決まる
  const heavy = oscillator(100, 4)
  const e0 = totalEnergy(heavy.state, heavy.springs)
  massSpringStepExplicit(heavy.state, heavy.springs, {}, 0.02)
  near(totalEnergy(heavy.state, heavy.springs) / e0, 1 + (0.02 ** 2 * 100) / 4, 1e-12)
})

test('半陰的オイラーは E - ½·Δt·k·x·v が毎ステップ変わらず、E との差だけでエネルギーが振動する', () => {
  const k = 100
  const dt = 0.01
  const { state, springs } = oscillator(k, 1)
  const invariant = () => totalEnergy(state, springs) - 0.5 * dt * k * state.pos[2] * state.vel[2]
  const initial = invariant()
  let worst = 0
  for (let s = 0; s < 4000; s++) {
    massSpringStep(state, springs, {}, dt)
    worst = Math.max(worst, Math.abs(invariant() - initial))
  }
  assert.ok(worst < 1e-10 * initial, `変わらない量が ${worst} ずれた`)
})

test('半陰的オイラーは、位置を新しい速度で更新するので x_n = x0 + g·Δt²·n(n+1)/2。前進オイラーは n(n-1)/2', () => {
  const g = -9.8
  const dt = 0.01
  const n = 100
  const params = { gravity: [0, g] }
  const semi = createMassSpringState(1)
  const explicit = createMassSpringState(1)
  semi.pos[1] = explicit.pos[1] = 3
  for (let s = 0; s < n; s++) {
    massSpringStep(semi, [], params, dt)
    massSpringStepExplicit(explicit, [], params, dt)
  }
  near(semi.vel[1], g * dt * n, 1e-12)
  near(explicit.vel[1], g * dt * n, 1e-12)
  near(semi.pos[1], 3 + (g * dt * dt * n * (n + 1)) / 2, 1e-10)
  near(explicit.pos[1], 3 + (g * dt * dt * n * (n - 1)) / 2, 1e-10)
  // 時間積分の関数との対応: 半陰的は u を新しい時刻で評価する形、前進オイラーは古い時刻の形
  const T = n * dt
  near(semi.pos[1], integrateNewTime((t) => g * t, 3, T, n), 1e-10)
  near(explicit.pos[1], integrateEuler((t) => g * t, 3, T, n), 1e-10)
  // 水平方向は力がないので動かない
  assert.equal(semi.pos[0], 0)
})

// ---------------------------------------------------------------------------
// 安定の限界
// ---------------------------------------------------------------------------

test('criticalDt(m, k) = 2√(m/k): m=1 で k=40000 なら 0.01、k=4m/Δt² と同じ', () => {
  assert.equal(criticalDt(1, 40000), 0.01)
  near(criticalDt(4, 100), 0.4, 1e-15)
  near(4 * 1 / criticalDt(1, 40000) ** 2, 40000, 1e-8)
})

test('m=1, Δt=0.01 の境目 k=40000 で、0.9 倍は 4000 ステップで最大 19.5 倍にとどまり、1.1 倍は 400 ステップで 1.2e217 倍に発散する', () => {
  const kc = 4 / 0.01 ** 2
  assert.equal(kc, 40000)
  assert.equal(round(maxEnergyRatio(massSpringStep, 0.9 * kc, 4000), 1), 19.5)
  assert.equal(sig(maxEnergyRatio(massSpringStep, 1.1 * kc, 400), 2), 1.2e217)
})

test('境目の 1.1 倍では、位置の大きさが毎ステップ 1.8633 倍(符号を変えながら)になる', () => {
  const { state, springs } = oscillator(1.1 * 40000, 1)
  let previous = state.pos[2]
  let ratio = 0
  for (let s = 0; s < 60; s++) {
    massSpringStep(state, springs, {}, 0.01)
    ratio = state.pos[2] / previous
    previous = state.pos[2]
  }
  assert.ok(ratio < 0) // 符号を変える
  assert.equal(round(Math.abs(ratio), 4), 1.8633)
  // 固有値の公式: λ² - (2 - (ωΔt)²)λ + 1 = 0 の大きいほうの大きさ
  const tr = 2 - 1.1 * 4
  near(Math.abs((tr - Math.sqrt(tr * tr - 4)) / 2), 1.8633249580710799, 1e-9)
})

test('境目より小さい k(0.99 倍)はエネルギーが大きく揺れても増え続けず、大きい k(1.01 倍)は増え続ける', () => {
  const early = maxEnergyRatio(massSpringStep, 0.99 * 40000, 2000)
  const late = maxEnergyRatio(massSpringStep, 0.99 * 40000, 20000)
  assert.ok(early > 100) // 境目に近いので、揺れは大きい
  near(late / early, 1, 1e-6) // しかし 10 倍長く動かしても最大値は変わらない
  const unstable = maxEnergyRatio(massSpringStep, 1.01 * 40000, 200) // 毎ステップ 1.22 倍
  assert.ok(unstable > 1e30, `${unstable}`)
})

test('criticalDt の上限は質量にも比例する: m を 4 倍にすると Δt の限界は 2 倍(同じ k)', () => {
  const grows = (m, dt) => {
    const { state, springs } = oscillator(100, m)
    let top = 0
    for (let s = 0; s < 600; s++) {
      massSpringStep(state, springs, {}, dt)
      top = Math.max(top, totalEnergy(state, springs))
    }
    return top
  }
  const initial = 50
  assert.ok(grows(1, 0.99 * criticalDt(1, 100)) < 100 * initial)
  assert.ok(grows(1, 1.01 * criticalDt(1, 100)) > 1e6 * initial)
  assert.ok(grows(4, 0.99 * criticalDt(4, 100)) < 100 * initial)
  assert.ok(grows(4, 1.01 * criticalDt(4, 100)) > 1e6 * initial)
  near(criticalDt(4, 100), 2 * criticalDt(1, 100), 1e-15)
})

test('質点の鎖(両端固定、10 個、k=50, m=1)は ω_max=13.998 で、限界 Δt=0.1429 の 0.95 倍では増えず、1.05 倍では 1 ステップに 1.877 倍になる', () => {
  const N = 10
  const k = 50
  const m = 1
  // 固有振動は sin(π j i/(N+1))(j=1..N)。j=N が最大で、ω² = (k/m)(2 - 2cos(πN/(N+1)))
  const mode = Array.from({ length: N + 2 }, (_, i) => Math.sin((Math.PI * N * i) / (N + 1)))
  for (let i = 1; i <= N; i++) {
    const applied = (k / m) * (2 * mode[i] - mode[i - 1] - mode[i + 1])
    near(applied, (k / m) * (2 + 2 * Math.cos(Math.PI / (N + 1))) * mode[i], 1e-12)
  }
  const omegaMax = 2 * Math.sqrt(k / m) * Math.cos(Math.PI / (2 * (N + 1)))
  assert.equal(round(omegaMax, 3), 13.998)
  const dtLimit = 2 / omegaMax
  assert.equal(round(dtLimit, 4), 0.1429)
  assert.ok(dtLimit < criticalDt(m, k)) // 質点が多いと、ばね 1 本の限界より小さい

  const run = (factor, steps) => {
    const { state, springs } = fixedChain(N, k, m)
    const eps = 1e-3
    for (let i = 1; i <= N; i++) state.pos[2 * i] += eps * mode[i]
    const amplitude = () => {
      let top = 0
      for (let i = 1; i <= N; i++) top = Math.max(top, Math.abs(state.pos[2 * i] - i))
      return top
    }
    let before = amplitude()
    let top = before
    let ratio = 0
    for (let s = 0; s < steps; s++) {
      massSpringStep(state, springs, {}, factor * dtLimit)
      const now = amplitude()
      ratio = now / before
      before = now
      top = Math.max(top, now)
    }
    return { top: top / eps, ratio }
  }
  const stable = run(0.95, 5000)
  assert.ok(stable.top < 4, `増えた(${stable.top} 倍)`)
  const unstable = run(1.05, 60)
  assert.equal(round(unstable.ratio, 3), 1.877)
  assert.ok(unstable.top > 1e10)
})

// ---------------------------------------------------------------------------
// 減衰・抵抗・外力・固定点
// ---------------------------------------------------------------------------

test('減衰つきの振動(m=1, k=100, kd=2)は t=1 で解析解 e^{-γt}(cos ω_d t + (γ/ω_d) sin ω_d t) に近づき、差は Δt に比例する', () => {
  const m = 1
  const k = 100
  const kd = 2
  const gamma = kd / (2 * m)
  const omegaD = Math.sqrt(k / m - gamma * gamma)
  const analytic = Math.exp(-gamma) * (Math.cos(omegaD) + (gamma / omegaD) * Math.sin(omegaD))
  const error = (dt) => {
    const { state, springs } = oscillator(k, m, { kd })
    for (let s = 0; s < Math.round(1 / dt); s++) massSpringStep(state, springs, {}, dt)
    return state.pos[2] - analytic
  }
  const e1 = Math.abs(error(1e-3))
  const e2 = Math.abs(error(5e-4))
  const e3 = Math.abs(error(2.5e-4))
  assert.ok(e3 < 1e-3)
  near(e1 / e2, 2, 0.05)
  near(e2 / e3, 2, 0.05)
})

test('減衰があるとエネルギーは減り、kd=0 のときより必ず小さい', () => {
  const run = (kd) => {
    const { state, springs } = oscillator(100, 1, { kd })
    for (let s = 0; s < 2000; s++) massSpringStep(state, springs, {}, 0.005)
    return totalEnergy(state, springs)
  }
  assert.ok(run(0) > 20)
  assert.ok(run(2) < 1e-3 * run(0))
})

test('重力でぶら下がった質点は、自然長より m·g/k だけ伸びた所で止まる(m=2, k=50, 自然長 1 で y=-1.392)', () => {
  const m = 2
  const k = 50
  const L0 = 1
  const { state, springs } = oscillator(k, m, { L0, kd: 3 })
  state.pos[2] = 0
  state.pos[3] = -L0 // 固定点 (0,0) の真下
  for (let s = 0; s < 10000; s++) massSpringStep(state, springs, { gravity: [0, -9.8] }, 0.002)
  assert.equal(round(state.pos[3], 4), -1.392)
  near(state.pos[3], -(L0 + (m * 9.8) / k), 1e-6)
  near(state.pos[2], 0, 1e-12)
  assert.ok(Math.hypot(state.vel[2], state.vel[3]) < 1e-6)
})

test('ぶら下げた鎖は、i 番目のばねが (下の質点の数)·m·g/k だけ伸びた所で止まる', () => {
  const N = 6
  const k = 200
  const m = 1
  const a = 1
  const state = createMassSpringState(N + 1)
  for (let i = 0; i <= N; i++) state.pos[2 * i + 1] = -i * a
  state.w[0] = 0
  const springs = []
  for (let i = 1; i <= N; i++) springs.push({ i: i - 1, j: i, k, kd: 8, L0: a })
  for (let s = 0; s < 30000; s++) massSpringStep(state, springs, { gravity: [0, -9.8] }, 0.002)
  for (let i = 1; i <= N; i++) {
    const length = Math.hypot(state.pos[2 * i] - state.pos[2 * i - 2], state.pos[2 * i + 1] - state.pos[2 * i - 1])
    near(length, a + ((N - i + 1) * m * 9.8) / k, 1e-4)
  }
  assert.ok(massSpringEnergy(state, springs).kinetic < 1e-8)
})

test('固定した質点(w=0)は、重力・ばね・外力を受けても位置も速度も変わらない', () => {
  const state = createMassSpringState(3)
  state.pos.set([1, 1, 2, 1, 2, 3])
  state.w[0] = 0
  const springs = [
    { i: 0, j: 1, k: 50, kd: 1, L0: 0.5 },
    { i: 1, j: 2, k: 50, kd: 1, L0: 0.5 },
  ]
  const params = {
    gravity: [0, -9.8],
    drag: 0.5,
    external: (st) => {
      st.f[0][0] += 100
      st.f[0][1] -= 100
    },
  }
  for (let s = 0; s < 500; s++) massSpringStep(state, springs, params, 0.005)
  assert.deepEqual(Array.from(state.pos.slice(0, 2)), [1, 1])
  assert.deepEqual(Array.from(state.vel.slice(0, 2)), [0, 0])
  assert.ok(state.pos[2] !== 2) // ほかの質点は動いている
})

test('外力なし・重力なしで固定点もない系では、ばねの力だけでは運動量の和 Σm·v が変わらない', () => {
  const rng = makeRng(73)
  const n = 7
  const state = createMassSpringState(n)
  const masses = []
  for (let i = 0; i < n; i++) {
    masses.push(0.5 + rng() * 3)
    state.w[i] = 1 / masses[i]
    state.pos[2 * i] = rng() * 4
    state.pos[2 * i + 1] = rng() * 4
    state.vel[2 * i] = rng() * 2 - 1
    state.vel[2 * i + 1] = rng() * 2 - 1
  }
  const springs = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rng() < 0.5) springs.push({ i, j, k: 20 + rng() * 30, kd: rng() * 2, L0: 0.5 + rng() * 2 })
    }
  }
  const momentum = () => {
    const sum = [0, 0]
    for (let i = 0; i < n; i++) {
      sum[0] += masses[i] * state.vel[2 * i]
      sum[1] += masses[i] * state.vel[2 * i + 1]
    }
    return sum
  }
  const before = momentum()
  for (let s = 0; s < 2000; s++) massSpringStep(state, springs, {}, 0.001)
  const after = momentum()
  near(after[0], before[0], 1e-9)
  near(after[1], before[1], 1e-9)
  // 重心の運動は等速直線運動
  assert.ok(springs.length > 5)
})

test('速度に比例する抵抗 drag は、自由な質点の速度を毎ステップ (1 - c·Δt/m) 倍にする', () => {
  const state = createMassSpringState(1)
  state.w[0] = 1 / 2 // m=2
  state.vel[0] = 3
  for (let s = 0; s < 50; s++) massSpringStep(state, [], { drag: 0.8 }, 0.01)
  near(state.vel[0], 3 * (1 - (0.8 * 0.01) / 2) ** 50, 1e-12)
})

test('external は 1 ステップに 1 回、state を受け取って力を足し込む(a = F/m)', () => {
  const state = createMassSpringState(2)
  state.w[1] = 1 / 2 // m=2
  let calls = 0
  const params = {
    external: (st) => {
      calls++
      assert.equal(st, state)
      st.f[1][0] += 4 // 質点 1 に x 向きに 4 N
    },
  }
  const dt = 0.01
  const n = 100
  for (let s = 0; s < n; s++) massSpringStep(state, [], params, dt)
  assert.equal(calls, n)
  near(state.vel[2], (4 / 2) * dt * n, 1e-12)
  near(state.pos[2], ((4 / 2) * dt * dt * n * (n + 1)) / 2, 1e-10)
  assert.equal(state.pos[0], 0) // 外力を受けない質点 0
})

test('computeForces は毎回力をゼロから集め直す(前の値が残らない)', () => {
  const { state, springs } = oscillator(100, 1, { stretch: 0.1 })
  state.f[1][0] = 999
  computeForces(state, springs, {})
  assert.equal(round(state.f[1][0], 9), -10)
  computeForces(state, springs, {})
  assert.equal(round(state.f[1][0], 9), -10)
})

// ---------------------------------------------------------------------------
// エネルギーの関数
// ---------------------------------------------------------------------------

test('massSpringEnergy: 運動エネルギーは ½mv²(m=1/w)、弾性エネルギーは ½k(L-L0)²', () => {
  const state = createMassSpringState(2)
  state.w[0] = 0.5 // m=2
  state.vel.set([3, 4, 100, 100])
  state.w[1] = 0 // 固定した質点は数えない
  state.pos.set([0, 0, 3, 4]) // L=5
  const { kinetic, elastic } = massSpringEnergy(state, [{ i: 0, j: 1, k: 8, kd: 0, L0: 3 }])
  assert.equal(kinetic, 0.5 * 2 * 25)
  assert.equal(elastic, 0.5 * 8 * 2 * 2)
})

// ---------------------------------------------------------------------------
// 風の力
// ---------------------------------------------------------------------------

test('ρ=1.2, S=0.01, U=(5,0,0), C_D=1 で D=(0.15,0,0)。n=(0,1,0), C_L=0.5 で L=(0,0.075,0)(2 次元でも同じ)', () => {
  const { lift, drag } = aeroForce([5, 0, 0], [0, 1, 0], 0.01, 1.2, 0.5, 1)
  assert.deepEqual(drag.map((q) => round(q, 9)), [0.15, 0, 0])
  assert.deepEqual(lift.map((q) => round(q, 9)), [0, 0.075, 0])
  const flat = aeroForce([5, 0], [0, 1], 0.01, 1.2, 0.5, 1)
  assert.deepEqual(flat.drag.map((q) => round(q, 9)), [0.15, 0])
  assert.deepEqual(flat.lift.map((q) => round(q, 9)), [0, 0.075])
})

test('風の速さを 2 倍にすると抗力も揚力も 4 倍になる', () => {
  const U = [5, 0]
  const base = aeroForce(U, [0, 1], 0.01, 1.2, 0.5, 1)
  const doubled = aeroForce([10, 0], [0, 1], 0.01, 1.2, 0.5, 1)
  near(doubled.drag[0], 4 * base.drag[0], 1e-12)
  near(doubled.lift[1], 4 * base.lift[1], 1e-12)
  const rng = makeRng(74)
  for (let trial = 0; trial < 100; trial++) {
    const Uv = [rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3]
    const nv = [rng() - 0.5, rng() - 0.5, rng() - 0.5]
    const len = Math.hypot(...nv)
    const n = nv.map((q) => q / len)
    const one = aeroForce(Uv, n, 0.5, 1.2, 1, 0.8)
    const two = aeroForce(Uv.map((q) => 2 * q), n, 0.5, 1.2, 1, 0.8)
    one.lift.forEach((q, i) => near(two.lift[i], 4 * q, 1e-10))
    one.drag.forEach((q, i) => near(two.drag[i], 4 * q, 1e-10))
  }
})

test('揚力は U に垂直で大きさ ½C_LρS|U|²sinθ、抗力は U と同じ向きで大きさ ½C_DρS|U|²、公式は外積の定義 (U×n)×U と一致する', () => {
  const rng = makeRng(75)
  const rho = 1.2
  const S = 0.5
  const CL = 1
  const CD = 0.8
  for (let trial = 0; trial < 200; trial++) {
    const U = [rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3]
    const nv = [rng() - 0.5, rng() - 0.5, rng() - 0.5]
    const n = nv.map((q) => q / Math.hypot(...nv))
    const { lift, drag } = aeroForce(U, n, S, rho, CL, CD)
    const speed = Math.hypot(...U)
    // 外積で直接計算した (U × n) × U
    const triple = cross3(cross3(U, n), U)
    lift.forEach((q, i) => near(q, 0.5 * CL * rho * S * triple[i], 1e-10))
    near(dot(lift, U), 0, 1e-10) // 揚力は U に垂直
    near(Math.hypot(...cross3(drag, U)), 0, 1e-10) // 抗力は U に平行
    assert.ok(dot(drag, U) > 0) // 同じ向き
    const sinTheta = Math.sqrt(1 - (dot(n, U) / speed) ** 2)
    near(Math.hypot(...lift), 0.5 * CL * rho * S * speed * speed * sinTheta, 1e-10)
    near(Math.hypot(...drag), 0.5 * CD * rho * S * speed * speed, 1e-10)
  }
})

test('法線 n が U と平行(風が板に垂直に当たる)なら揚力は 0、抗力だけが残る', () => {
  const { lift, drag } = aeroForce([3, 4], [0.6, 0.8], 2, 1.2, 1, 1)
  assert.deepEqual(lift.map((q) => round(q, 12)), [0, 0])
  near(Math.hypot(...drag), 0.5 * 1.2 * 2 * 25, 1e-12)
})

test('aeroForce は out を渡すと配列を作らずに書き換える', () => {
  const out = { lift: [9, 9], drag: [9, 9] }
  const result = aeroForce([5, 0], [0, 1], 0.01, 1.2, 0.5, 1, out)
  assert.equal(result, out)
  assert.deepEqual(out.drag.map((q) => round(q, 9)), [0.15, 0])
  assert.deepEqual(out.lift.map((q) => round(q, 9)), [0, 0.075])
})

function plate(p0, p1, v0 = [0, 0], v1 = [0, 0]) {
  const state = createMassSpringState(2)
  state.pos.set([...p0, ...p1])
  state.vel.set([...v0, ...v1])
  return state
}

test('addWindForces: 風に垂直な板は抗力 ½C_DρS|U|U を受け、両端に半分ずつかかる(揚力は 0)', () => {
  // 線分 (0,0)-(2,0) を板(奥行 0.5、S=1)として、上向きの風 (0,4) を当てる
  const state = plate([0, 0], [2, 0])
  addWindForces(state, [{ i: 0, j: 1 }], [0, 4], 0.5, 1.2, 0.5, 1)
  const drag = 0.5 * 1 * 1.2 * 1 * 4 * 4 // ½C_DρS|U|²
  assert.deepEqual(Array.from(state.force).map((q) => round(q, 9)), [0, drag / 2, 0, drag / 2])
  assert.equal(round(drag, 6), 9.6)
})

test('addWindForces: 風と平行な板は、風下を向く法線の側に揚力 ½C_LρS|U|² を受ける', () => {
  const state = plate([0, 0], [2, 0])
  addWindForces(state, [{ i: 0, j: 1 }], [4, 0], 0.5, 1.2, 0.5, 1)
  // 線分の法線 (-dy,dx)/L = (0,1) は風 (4,0) と垂直(内積 0)なので、そのまま (0,1)
  const lift = 0.5 * 1.2 * 1 * 0.5 * 16 // ½ρS C_L |U|²
  const drag = 0.5 * 1.2 * 1 * 1 * 4 * 4
  assert.deepEqual(Array.from(state.force).map((q) => round(q, 9)), [drag / 2, lift / 2, drag / 2, lift / 2])
})

test('addWindForces: 風に斜めの板の力は aeroForce(板の法線は風下向き)の半分ずつで、線分の端の順序によらない', () => {
  const wind = [5, 0]
  const rho = 1.2
  const expected = aeroForce(wind, [Math.SQRT1_2, -Math.SQRT1_2], Math.SQRT2 * 2, rho, 0.7, 0.9)
  const total = [0, 1].map((k) => expected.lift[k] + expected.drag[k])
  assert.ok(total[0] > 0 && total[1] < 0) // 右へ押され、下へ揚力を受ける
  for (const [i, j] of [
    [0, 1],
    [1, 0],
  ]) {
    const state = plate([0, 0], [1, 1])
    addWindForces(state, [{ i, j }], wind, 2, rho, 0.7, 0.9)
    near(state.force[0], total[0] / 2, 1e-12)
    near(state.force[1], total[1] / 2, 1e-12)
    near(state.force[2], total[0] / 2, 1e-12)
    near(state.force[3], total[1] / 2, 1e-12)
  }
})

test('addWindForces: 風と同じ速度で動く板は力を受けず、風が 2 倍になると力は 4 倍', () => {
  const moving = plate([0, 0], [1, 1], [5, 0], [5, 0])
  addWindForces(moving, [{ i: 0, j: 1 }], [5, 0], 1, 1.2, 0.5, 1)
  assert.deepEqual(Array.from(moving.force), [0, 0, 0, 0])
  const slow = plate([0, 0], [1, 1])
  const fast = plate([0, 0], [1, 1])
  addWindForces(slow, [{ i: 0, j: 1 }], [3, 1], 1, 1.2, 0.5, 1)
  addWindForces(fast, [{ i: 0, j: 1 }], [6, 2], 1, 1.2, 0.5, 1)
  slow.force.forEach((q, i) => near(fast.force[i], 4 * q, 1e-12))
})

test('addWindForces は force に足し込む(上書きしない)。computeForces の external に渡して 1 ステップで使える', () => {
  // 風だけを受ける 2 点の鎖 (0,0)-(1,0) が、上向きの風 (0,3) で上に押される
  const state = createMassSpringState(2)
  state.pos.set([0, 0, 1, 0])
  const segments = [{ i: 0, j: 1 }]
  const params = { external: (st) => addWindForces(st, segments, [0, 3], 1, 1.2, 0, 1) }
  massSpringStep(state, [], params, 0.01)
  assert.ok(state.vel[1] > 0 && state.vel[3] > 0)
  assert.equal(state.vel[0], 0)
  // 力は 0.5·C_D·ρ·S·|U|² = 0.5·1·1.2·1·9 = 5.4 の半分ずつ
  near(state.force[1], 2.7, 1e-12)
  near(state.vel[1], 0.01 * 2.7, 1e-12)
  computeForces(state, [], params)
  near(state.force[1], 2.7 * 1, 0.2) // 速度を持った後の相対速度分だけ少し小さいが、足し込み直されて累積しない
  assert.ok(state.force[1] < 2.7 && state.force[1] > 2.5)
})
