// 流体の段階 1(重み関数)の計算(src/components/visualization/sims/fluidKernel1d.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KERNELS,
  weight1d,
  densities1d,
  volumes1d,
  interpolate1d,
  weightSum1d,
  countWithin1d,
  evenPositions,
  presetValues,
  moveParticle1d,
  X_RANGE,
} from '../../src/components/visualization/sims/fluidKernel1d.js'

const near = (actual, expected, tol, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} ${actual} と ${expected} の差が ${tol} を超えた`)

test('1 次元の係数: 3 次スプラインは解析値 4/(3h)(= 2/(3s)、s = h/2)と一致し、どの核も ∫W dx = 1', () => {
  for (const h of [0.05, 0.2, 0.5]) {
    // 核の中心の値 W(0) = 係数 σ(f(0) = 1)。解析値 σ = 2/(3s) = 4/(3h)
    near(weight1d('spline', 0, h), 4 / (3 * h), 1e-6 * (4 / (3 * h)), `h=${h}`)
  }
  // 積分を別の刻み(中点則 20000 区間)で確かめる
  for (const { id } of KERNELS) {
    const h = 0.3
    const N = 20000
    const d = (2 * h) / N
    let sum = 0
    for (let i = 0; i < N; i++) sum += weight1d(id, -h + (i + 0.5) * d, h) * d
    near(sum, 1, 1e-6, id)
  }
})

test('核は偶関数で、中心が最大、h 以上で 0', () => {
  for (const { id } of KERNELS) {
    const h = 0.2
    assert.equal(weight1d(id, 0.07, h), weight1d(id, -0.07, h))
    assert.ok(weight1d(id, 0, h) > weight1d(id, 0.1, h) && weight1d(id, 0.1, h) > weight1d(id, 0.19, h))
    assert.equal(weight1d(id, h, h), 0)
    assert.equal(weight1d(id, 2 * h, h), 0)
  }
})

test('重みの和: 等間隔の粒子の内側では 1 に近く、端では 1 より小さくなる', () => {
  const xs = evenPositions(11) // 間隔 0.09
  for (const { id } of KERNELS) {
    for (const h of [0.2, 0.3]) {
      const vols = volumes1d(xs, id, h)
      const tol = id === 'spiky' ? 0.2 : 0.05 // spiky はとがっていて、粒子の間隔に対して h が小さいと、等間隔でも 1 から 2 割ほどずれる
      for (const x of [0.4, 0.5, 0.57]) near(weightSum1d(x, xs, vols, id, h), 1, tol, `${id} h=${h} x=${x}`)
      assert.ok(weightSum1d(0, xs, vols, id, h) < 0.8, `${id}: 端の和 ${weightSum1d(0, xs, vols, id, h)}`)
    }
  }
})

test('値がすべて同じなら、内側の補間はその値に戻る(重みの和が 1 に近いので)', () => {
  const xs = evenPositions(12)
  const vals = xs.map(() => 0.6)
  const vols = volumes1d(xs, 'spline', 0.25)
  for (const x of [0.35, 0.5, 0.62]) near(interpolate1d(x, xs, vals, vols, 'spline', 0.25), 0.6, 0.02, `x=${x}`)
})

test('h が大きいほど段差がなだらかになる(中央の傾きが小さくなる)', () => {
  const xs = evenPositions(21)
  const vals = presetValues('step', xs)
  const slope = (h) => {
    const vols = volumes1d(xs, 'spline', h)
    const a = interpolate1d(0.5 - 0.02, xs, vals, vols, 'spline', h)
    const b = interpolate1d(0.5 + 0.02, xs, vals, vols, 'spline', h)
    return (b - a) / 0.04
  }
  assert.ok(slope(0.1) > slope(0.2) && slope(0.2) > slope(0.4), `${slope(0.1)} ${slope(0.2)} ${slope(0.4)}`)
})

test('密度と体積: 粒子を詰めると体積が小さくなり、体積の和は粒子の並ぶ長さに近い', () => {
  const xs = evenPositions(11)
  const vols = volumes1d(xs, 'spline', 0.2)
  const sum = vols.reduce((a, b) => a + b, 0)
  near(sum, 0.9 + 0.09, 0.12) // 並ぶ長さ 0.9 m に、両端の半分ずつを足したあたり
  const dense = xs.slice()
  dense[5] = dense[4] + 0.01 // 粒子 5 を粒子 4 のすぐ隣へ
  const rho = densities1d(dense, 'spline', 0.2)
  const rho0 = densities1d(xs, 'spline', 0.2)
  assert.ok(rho[5] > rho0[5] && rho[4] > rho0[4])
  assert.equal(countWithin1d(0.5, xs, 0.1), 3)
})

test('moveParticle1d: 隣の粒子を越えず、範囲の外に出ない', () => {
  const xs = evenPositions(5)
  const vals = presetValues('wave', xs)
  moveParticle1d(xs, vals, 2, 5, 9)
  assert.ok(xs[2] < xs[3] && xs[2] > xs[1])
  assert.ok(vals[2] <= 1.1)
  moveParticle1d(xs, vals, 0, -3, -3)
  assert.ok(xs[0] >= X_RANGE[0] && vals[0] >= 0)
  assert.deepEqual(presetValues('random', xs), presetValues('random', xs)) // 種が固定
})
