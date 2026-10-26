// flow.js の性質(数値積分、流線・流跡線・流脈線、LIC、出発点、特異点)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCriticalPoint, doubleGyre, eulerStep2, evenlySpacedStreamlines, findCriticalPoints, gridField, jacobian2, lic,
  pathline, rk4Step2, rotationField, seedsByMagnitude, seedsUniform, streakline, streamline, vortexField,
} from '../../src/utils/vis/flow.js'
import { seededRandom } from '../../src/utils/vis/ct.js'

const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)

// 回転の場 v = (−y, x) を、(1, 0) からちょうど 1 周ぶん進めたときの、半径のずれと、出発点からのずれ
function afterTurn(step, h) {
  const field = rotationField(1)
  let p = [1, 0]
  const steps = Math.round((2 * Math.PI) / h)
  for (let i = 0; i < steps; i++) p = step(field, p, (2 * Math.PI) / steps)
  return { radius: Math.abs(Math.hypot(p[0], p[1]) - 1), position: Math.hypot(p[0] - 1, p[1]) }
}

test('回転の場を 1 周たどると、RK4 はほとんどずれず、オイラーは外へずれる。RK4 の位置の誤差は h⁴ に比例', () => {
  const rk = afterTurn(rk4Step2, 0.01).radius
  const eu = afterTurn(eulerStep2, 0.01).radius
  assert.ok(rk < 1e-6, `RK4 ${rk}`)
  assert.ok(eu > 0.02, `オイラー ${eu}`) // 1 歩ごとに半径が √(1 + h²) 倍: (1 + h²)^{π/h} − 1 ≈ πh
  const e1 = afterTurn(rk4Step2, 0.2).position
  const e2 = afterTurn(rk4Step2, 0.1).position
  near(Math.log2(e1 / e2), 4, 0.3)
})

test('流線は出発点を通り、範囲の外と速さ 0 で止まる', () => {
  const pts = streamline(rotationField(1), [0.5, 0], { h: 0.05, maxSteps: 400, bounds: [-1, -1, 1, 1] })
  for (const p of pts) near(Math.hypot(p[0], p[1]), 0.5, 1e-4)
  const out = streamline(() => [1, 0], [0.9, 0], { h: 0.05, maxSteps: 100, bounds: [-1, -1, 1, 1], direction: 'forward' })
  assert.ok(out.length <= 3)
  const still = streamline(() => [0, 0], [0, 0], { h: 0.05, maxSteps: 100 })
  assert.equal(still.length, 1)
})

test('ダブルジャイヤーは発散が 0 で、ε = 0 なら時間で変わらない', () => {
  const field = doubleGyre({ eps: 0.25 })
  const h = 1e-5
  for (const [x, y, t] of [[0.3, 0.4, 0], [1.2, 0.7, 2.5], [1.8, 0.2, 7.1]]) {
    const div = (field(x + h, y, t)[0] - field(x - h, y, t)[0]) / (2 * h) + (field(x, y + h, t)[1] - field(x, y - h, t)[1]) / (2 * h)
    near(div, 0, 1e-6)
  }
  const steady = doubleGyre({ eps: 0 })
  assert.deepEqual(steady(0.7, 0.3, 0), steady(0.7, 0.3, 4.2))
})

test('時間で変わらない場では、流跡線は流線の上を進み、流脈線もその上に並ぶ', () => {
  const field = doubleGyre({ eps: 0 })
  const seed = [0.6, 0.5]
  const path = pathline(field, seed, 0, 6, 0.01)
  // 流れの関数 ψ は流線の上で一定: ψ = A sin(πx) sin(πy)
  const psi = (p) => Math.sin(Math.PI * p[0]) * Math.sin(Math.PI * p[1])
  for (const p of path) near(psi(p), psi(seed), 1e-6)
  for (const p of streakline(field, seed, 0, 4, 0.01, 0.5)) near(psi(p), psi(seed), 1e-6)
  // 時間で変わる場では、流跡線は ψ が一定の線から外れる
  const moving = pathline(doubleGyre({ eps: 0.25 }), seed, 0, 6, 0.01)
  assert.ok(Math.abs(psi(moving[moving.length - 1]) - psi(seed)) > 1e-3)
})

test('LIC: L = 0 ならノイズのまま。横向きの一様な場では、横方向のばらつきがノイズより小さい', () => {
  const w = 64
  const h = 64
  const rand = seededRandom(11)
  const noise = Float32Array.from({ length: w * h }, () => rand())
  const same = lic(() => [1, 0], noise, w, h, 0)
  for (let i = 0; i < w * h; i++) near(same[i], noise[i], 1e-7)
  const out = lic(() => [1, 0], noise, w, h, 12)
  const rowVar = (img) => {
    let s = 0
    for (let j = 0; j < h; j++) for (let i = 1; i < w; i++) s += (img[j * w + i] - img[j * w + i - 1]) ** 2
    return s
  }
  assert.ok(rowVar(out) < 0.2 * rowVar(noise))
})

test('出発点: 均等な格子の数と、速さに合わせた置き方は速い所に多い', () => {
  assert.equal(seedsUniform(4, 3, [0, 0, 1, 1]).length, 12)
  const field = (x) => [x < 0.5 ? 0.05 : 1, 0] // 右半分が速い
  const seeds = seedsByMagnitude(field, 400, [0, 0, 1, 1], seededRandom(3))
  const right = seeds.filter((p) => p[0] >= 0.5).length
  assert.ok(right > 0.85 * seeds.length)
})

test('間隔をそろえた流線: 互いに dsep/2 より近づかない', () => {
  const dsep = 0.1
  const lines = evenlySpacedStreamlines(vortexField([{ x: 0.5, y: 0.5, strength: 1, core: 0.1 }]), [0, 0, 1, 1], dsep)
  assert.ok(lines.length > 3)
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      for (const p of lines[a]) for (const q of lines[b]) assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= dsep / 2 - 1e-9)
    }
  }
})

test('特異点の分類: 6 つの種類と固有値', () => {
  assert.equal(classifyCriticalPoint([[1, 0], [0, -2]]).type, 'saddle')
  assert.equal(classifyCriticalPoint([[1, 0], [0, 2]]).type, 'source')
  assert.equal(classifyCriticalPoint([[-1, 0], [0, -3]]).type, 'sink')
  assert.equal(classifyCriticalPoint([[0, -1], [1, 0]]).type, 'center')
  assert.equal(classifyCriticalPoint([[0.2, -1], [1, 0.2]]).type, 'spiral-out')
  const c = classifyCriticalPoint([[-0.3, -2], [2, -0.3]])
  assert.equal(c.type, 'spiral-in')
  near(c.eigenvalues[0].re, -0.3)
  near(Math.abs(c.eigenvalues[0].im), 2)
  const J = jacobian2(rotationField(1), [0.3, 0.1])
  near(J[0][1], -1, 1e-8)
  near(J[1][0], 1, 1e-8)
})

test('零点の分かっている場で、特異点の位置と種類を当てる', () => {
  // 2 つの同じ向きの渦の間には鞍点ができる
  const field = vortexField([{ x: 0.3, y: 0.5, strength: 1, core: 0.08 }, { x: 0.7, y: 0.5, strength: 1, core: 0.08 }])
  const found = findCriticalPoints(field, [0, 0, 1, 1], 40)
  const saddle = found.find((c) => c.type === 'saddle')
  assert.ok(saddle)
  near(saddle.p[0], 0.5, 1e-6)
  near(saddle.p[1], 0.5, 1e-6)
  assert.ok(found.filter((c) => c.type === 'center' || c.type.startsWith('spiral')).length >= 2)
})

test('格子の速度の場は、マスの中心で格子の値', () => {
  const n = 4
  const dx = 0.25
  const u = Float64Array.from({ length: n * n }, (_, k) => k)
  const v = new Float64Array(n * n)
  const f = gridField(u, v, n, dx)
  near(f(1.5 * dx, 2.5 * dx)[0], u[1 + n * 2])
})

test('スポットノイズ: 横向きの場では、模様が横に長く伸びる(横の差が縦の差より小さい)', async () => {
  const { spotNoise } = await import('../../src/utils/vis/flow.js')
  const w = 80
  const h = 80
  const img = spotNoise(() => [1, 0], w, h, 1500, { rand: seededRandom(4), length: 0.08, width: 0.012 })
  let dx = 0
  let dy = 0
  for (let j = 1; j < h; j++) for (let i = 1; i < w; i++) {
    dx += (img[j * w + i] - img[j * w + i - 1]) ** 2
    dy += (img[j * w + i] - img[(j - 1) * w + i]) ** 2
  }
  assert.ok(dx < 0.5 * dy)
})
