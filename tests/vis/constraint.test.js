import test from 'node:test'
import assert from 'node:assert/strict'
import { pendulumLambda, pendulumStep, softLambda, erpDecay } from '../../src/utils/vis/constraint.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

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

const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const g = 9.8

// 拘束 C(x) = ½(x·x - 1)
const C = (x) => 0.5 * (dot(x, x) - 1)

test('m=1, f=(0,-9.8), x=(0.6,-0.8), v=(0.8,0.6) で λ=-8.84、拘束力 f_c=(-5.304, 7.072)、C̈=0', () => {
  const m = 1
  const f = [0, -g]
  const x = [0.6, -0.8]
  const v = [0.8, 0.6]
  const lambda = pendulumLambda(x, v, f, m)
  assert.equal(round(lambda, 2), -8.84)
  const fc = [lambda * x[0], lambda * x[1]] // f_c = Jᵀλ = λx
  assert.deepEqual(fc.map((q) => round(q, 3)), [-5.304, 7.072])
  const acc = [(f[0] + fc[0]) / m, (f[1] + fc[1]) / m]
  assert.deepEqual(acc.map((q) => round(q, 3)), [-5.304, -2.728])
  // C̈ = ẋ·ẋ + x·ẍ = 0
  near(dot(v, v) + dot(x, acc), 0, 1e-12)
  // 拘束力は動き(速度)に仕事をしない: J v = x·v = 0 なので f_c·v = λ(x·v) = 0
  near(dot(x, v), 0)
  near(dot(fc, v), 0, 1e-12)
  // 張力は m·g·cosφ + m·v²/ℓ = 9.8·0.8 + 1 = 8.84
  near(Math.hypot(...fc), 9.8 * 0.8 + 1, 1e-12)
})

test('λ は、拘束の上にない状態や質量が違う場合でも C̈ = ẋ·ẋ + x·ẍ = 0 を満たす', () => {
  const rng = makeRng(61)
  for (let trial = 0; trial < 500; trial++) {
    const x = [rng() * 4 - 2, rng() * 4 - 2]
    const v = [rng() * 6 - 3, rng() * 6 - 3]
    const f = [rng() * 20 - 10, rng() * 20 - 10]
    const m = 0.2 + rng() * 5
    const lambda = pendulumLambda(x, v, f, m)
    const acc = [(f[0] + lambda * x[0]) / m, (f[1] + lambda * x[1]) / m]
    near(dot(v, v) + dot(x, acc), 0, 1e-9)
  }
})

test('ヤコビアン J = ∂C/∂x は横ベクトル xᵀ(中心差分で確かめる)', () => {
  const rng = makeRng(62)
  const h = 1e-6
  for (let trial = 0; trial < 50; trial++) {
    const x = [rng() * 4 - 2, rng() * 4 - 2]
    const J = [0, 1].map((k) => {
      const plus = x.slice()
      const minus = x.slice()
      plus[k] += h
      minus[k] -= h
      return (C(plus) - C(minus)) / (2 * h)
    })
    near(J[0], x[0], 1e-8)
    near(J[1], x[1], 1e-8)
  }
})

test('最下点では張力が m·g + m·v²/ℓ(ℓ=1)になり、水平に支えた直後(v=0)は張力が 0', () => {
  const m = 2
  const f = [0, -m * g]
  const bottomSpeed = 3
  const lambdaBottom = pendulumLambda([0, -1], [bottomSpeed, 0], f, m)
  const fcBottom = [lambdaBottom * 0, lambdaBottom * -1] // 上向き
  near(fcBottom[1], m * g + m * bottomSpeed ** 2, 1e-12)
  assert.equal(pendulumLambda([1, 0], [0, 0], f, m) + 0, 0) // 重力が x に垂直で、速度が 0
})

test('Δt=1e-4 で 20000 ステップ(2 秒)後の振り子の長さは 1.00098 で、ずれは約 1e-3', () => {
  const state = { x: [1, 0], v: [0, 0] }
  for (let k = 0; k < 20000; k++) pendulumStep(state, [0, -g], 1, 1e-4)
  const length = Math.hypot(...state.x)
  assert.equal(round(length, 5), 1.00098)
  assert.equal(round(length - 1, 3), 0.001)
})

test('拘束のずれは Δt に比例する(Δt を半分にすると、同じ時刻のずれも半分)', () => {
  const drift = (dt) => {
    const state = { x: [1, 0], v: [0, 0] }
    const n = Math.round(2 / dt)
    for (let k = 0; k < n; k++) pendulumStep(state, [0, -g], 1, dt)
    return Math.hypot(...state.x) - 1
  }
  const d1 = drift(2e-4)
  const d2 = drift(1e-4)
  const d3 = drift(5e-5)
  assert.ok(d3 > 0)
  near(d1 / d2, 2, 0.01)
  near(d2 / d3, 2, 0.01)
})

test('pendulumStep は state の配列をその場で書き換え、使った λ を返す', () => {
  const x = [0.6, -0.8]
  const v = [0.8, 0.6]
  const state = { x, v }
  const lambda = pendulumStep(state, [0, -g], 1, 0.01)
  assert.equal(state.x, x)
  assert.equal(state.v, v)
  assert.equal(round(lambda, 2), -8.84)
  // 速度を先に更新して、新しい速度で位置を更新する
  near(v[0], 0.8 + 0.01 * (-5.304), 1e-12)
  near(v[1], 0.6 + 0.01 * (-9.8 + 7.072), 1e-12)
  near(x[0], 0.6 + 0.01 * v[0], 1e-12)
  near(x[1], -0.8 + 0.01 * v[1], 1e-12)
})

test('同じ振り子を精度の高い RK4 で解いた角度の式 θ″=-g·sinθ と比べると、差は Δt に比例して縮む', () => {
  // 長さ 1、θ=π/2(水平)から静かに放す。x = (sinθ, -cosθ)
  const rk4 = (T, h) => {
    const f = (th, om) => [om, -g * Math.sin(th)]
    let th = Math.PI / 2
    let om = 0
    for (let k = 0; k < Math.round(T / h); k++) {
      const k1 = f(th, om)
      const k2 = f(th + (h / 2) * k1[0], om + (h / 2) * k1[1])
      const k3 = f(th + (h / 2) * k2[0], om + (h / 2) * k2[1])
      const k4 = f(th + h * k3[0], om + h * k3[1])
      th += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
      om += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    }
    return [Math.sin(th), -Math.cos(th)]
  }
  const ref = rk4(2, 1e-4)
  const error = (dt) => {
    const state = { x: [1, 0], v: [0, 0] }
    for (let k = 0; k < Math.round(2 / dt); k++) pendulumStep(state, [0, -g], 1, dt)
    return Math.hypot(state.x[0] - ref[0], state.x[1] - ref[1])
  }
  const e1 = error(5e-4)
  const e2 = error(2.5e-4)
  const e3 = error(1.25e-4)
  assert.ok(e3 < 3e-3)
  near(e1 / e2, 2, 0.05)
  near(e2 / e3, 2, 0.05)
})

test('小さな振れの周期は 2π√(ℓ/g)(ℓ=1, g=9.8 で 2.007 s)に近い', () => {
  const theta0 = 0.05
  const dt = 1e-4
  const state = { x: [Math.sin(theta0), -Math.cos(theta0)], v: [0, 0] }
  // x 座標が最初に 0 を通る時刻が 1/4 周期
  let t = 0
  let previousX = state.x[0]
  while (state.x[0] > 0) {
    previousX = state.x[0]
    pendulumStep(state, [0, -g], 1, dt)
    t += dt
  }
  const crossing = t + (dt * state.x[0]) / (previousX - state.x[0]) // 0 を通った時刻を線形補間で求める
  const period = 4 * crossing
  const exact = 2 * Math.PI * Math.sqrt(1 / g) * (1 + theta0 ** 2 / 16) // 振れ角の補正つき
  assert.equal(round(2 * Math.PI * Math.sqrt(1 / g), 3), 2.007)
  near(period / exact, 1, 5e-4)
})

test('エネルギー ½mv²+mgy の変化は Δt に比例して小さくなる', () => {
  const deviation = (dt) => {
    const state = { x: [1, 0], v: [0, 0] }
    let worst = 0
    for (let k = 0; k < Math.round(2 / dt); k++) {
      pendulumStep(state, [0, -g], 1, dt)
      const energy = 0.5 * dot(state.v, state.v) + g * state.x[1] // 初めは 0
      worst = Math.max(worst, Math.abs(energy))
    }
    return worst
  }
  const d1 = deviation(2e-4)
  const d2 = deviation(1e-4)
  assert.ok(d2 < 0.03)
  near(d1 / d2, 2, 0.05)
})

test('質量 m は拘束力の大きさに入り、軽い振り子と重い振り子で運動が同じになる(重力だけのとき)', () => {
  const run = (m) => {
    const state = { x: [1, 0], v: [0, 0] }
    for (let k = 0; k < 5000; k++) pendulumStep(state, [0, -m * g], m, 1e-3)
    return state.x
  }
  const light = run(0.1)
  const heavy = run(10)
  near(light[0], heavy[0], 1e-9)
  near(light[1], heavy[1], 1e-9)
})

// ---------------------------------------------------------------------------
// Soft Constraint(ERP と CFM)
// ---------------------------------------------------------------------------

test('softLambda は J v + (β/Δt)·C + γ·λ = 0 を満たし、γ が小さいほど λ が大きい', () => {
  const rng = makeRng(63)
  for (let trial = 0; trial < 200; trial++) {
    const Jv = rng() * 4 - 2
    const Cv = rng() * 0.4 - 0.2
    const beta = rng()
    const gamma = 0.01 + rng()
    const dt = 1 / 60
    const lambda = softLambda(Jv, Cv, beta, gamma, dt)
    near(Jv + (beta / dt) * Cv + gamma * lambda, 0, 1e-9)
    near(softLambda(Jv, Cv, beta, gamma / 2, dt), 2 * lambda, 1e-9)
  }
})

test('softLambda は、ずれ C に比例する力(バネ)と、拘束の速度 J v に比例する力(ダンパー)の和になる', () => {
  const dt = 1 / 60
  const beta = 0.2
  const gamma = 0.05
  // J v = 0 のとき λ = -(β/(γΔt))·C: ばね定数 β/(γΔt)
  near(softLambda(0, 0.1, beta, gamma, dt) / 0.1, -beta / (gamma * dt), 1e-9)
  // C = 0 のとき λ = -J v/γ: 減衰係数 1/γ
  near(softLambda(0.3, 0, beta, gamma, dt) / 0.3, -1 / gamma, 1e-9)
  // 線形(重ね合わせ)
  near(
    softLambda(0.3, 0.1, beta, gamma, dt),
    softLambda(0.3, 0, beta, gamma, dt) + softLambda(0, 0.1, beta, gamma, dt),
    1e-9,
  )
})

test('円の外へずれた(C>0)振り子では、softLambda による拘束力 λx は中心の向き(内向き)になる', () => {
  const x = [1.2, 0]
  assert.ok(C(x) > 0)
  const lambda = softLambda(0, C(x), 0.2, 0.05, 1 / 60)
  assert.ok(lambda < 0)
  assert.ok(lambda * x[0] < 0) // 力の x 成分が負: 原点へ引き戻す
})

test('β=0 なら C のずれを直さない: λ は J v だけで決まる', () => {
  near(softLambda(0.7, 123, 0, 0.1, 1 / 60), -7, 1e-12)
})

test('C0=0.1 の 10 ステップ後は β=0.2 で 0.0107、β=0.5 で 9.77e-5(毎ステップ (1-β) 倍)', () => {
  assert.equal(round(erpDecay(0.1, 0.2, 10), 4), 0.0107)
  near(erpDecay(0.1, 0.5, 10) / 9.77e-5, 1, 5e-4)
  assert.equal(Number(erpDecay(0.1, 0.5, 10).toPrecision(3)), 9.77e-5)
  for (const beta of [0.1, 0.2, 0.5, 0.9]) {
    for (const n of [1, 5, 10, 30]) {
      near(erpDecay(0.1, beta, n), 0.1 * (1 - beta) ** n, 1e-14)
    }
  }
})

test('erpDecay は Δt によらず、β=1 なら 1 ステップで 0、β=0 なら変わらない', () => {
  for (const dt of [1 / 240, 1 / 60, 0.1, 1]) {
    near(erpDecay(0.1, 0.2, 10, dt), erpDecay(0.1, 0.2, 10), 1e-12)
  }
  near(erpDecay(0.1, 1, 1), 0, 1e-15)
  assert.equal(erpDecay(0.1, 0, 50), 0.1)
  assert.equal(erpDecay(0.1, 0.3, 0), 0.1)
})
