// 見せ方「IK」(src/components/visualization/sims/transformIk.js)の、状態と終わり方を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  L1,
  L2,
  MAX_ITER,
  TOL,
  analyticPose,
  clampTarget,
  createIk,
  ikView,
  pixelToWorld,
  readoutText,
  restartIterations,
  stepJacobian,
  tipError,
} from '../../src/components/visualization/sims/transformIk.js'

// 止まるまで 1 歩ずつ進めて、進めた回数を返す
function run(s, lambda = 0.2, maxStep = 0.3) {
  let steps = 0
  while (stepJacobian(s, lambda, maxStep)) steps++
  return steps
}

test('届く目標: 反復が誤差 TOL 未満で止まり、数えた回数と進めた回数が一致する', () => {
  const s = createIk()
  assert.equal(s.status, 'running')
  assert.equal(s.iter, 0)
  assert.ok(tipError(s) > TOL)
  const steps = run(s)
  assert.equal(s.status, 'converged')
  assert.equal(s.iter, steps)
  assert.ok(steps > 0 && steps < MAX_ITER)
  assert.ok(tipError(s) < TOL)
})

test('止まったあとは、もう進めない(false を返し、回数も角度も変わらない)', () => {
  const s = createIk()
  run(s)
  const before = { iter: s.iter, theta: [...s.theta] }
  assert.equal(stepJacobian(s, 0.2, 0.3), false)
  assert.equal(s.iter, before.iter)
  assert.deepEqual(s.theta, before.theta)
})

test('届かない目標(腕の長さの合計 1.7 より遠い): 打ち切りで止まる。回数は MAX_ITER 以内、誤差は縮まない', () => {
  const s = createIk()
  s.target = [3, 0]
  restartIterations(s)
  assert.equal(s.status, 'running')
  run(s)
  assert.equal(s.status, 'stalled')
  assert.ok(s.iter <= MAX_ITER)
  assert.ok(tipError(s) > 3 - (L1 + L2) - 1e-3) // どう曲げても、遠さ - 腕の全長より近づけない
})

test('λ = 0 で腕が伸びきった姿勢(J が特異): 解けないとして止まる(NaN で進めない)', () => {
  const s = createIk()
  s.theta = [0, 0]
  s.target = [1.5, 0.1]
  restartIterations(s)
  assert.equal(stepJacobian(s, 0, 0.3), false)
  assert.equal(s.status, 'singular')
  assert.deepEqual(s.theta, [0, 0])
  // 同じ姿勢でも λ > 0 なら進める
  restartIterations(s)
  assert.equal(s.status, 'running')
  assert.equal(stepJacobian(s, 0.2, 0.3), true)
})

test('restartIterations: 回数を 0 に戻す。いまの姿勢がもう目標に届いていれば、すぐ収束', () => {
  const s = createIk()
  run(s)
  assert.ok(s.iter > 0)
  s.target = [...s.target]
  restartIterations(s)
  assert.equal(s.iter, 0)
  assert.equal(s.status, 'converged') // 姿勢は動かしていない

  s.theta = analyticPose([0.5, 0.9], true)
  s.target = [0.5, 0.9]
  restartIterations(s)
  assert.equal(s.status, 'converged')
})

test('画面と世界の座標: pixelToWorld は腕の根元(canvas の中心)を原点にして、y を上向きにする。clampTarget は canvas の中に収める', () => {
  const view = ikView(800, 600)
  assert.deepEqual(pixelToWorld(view, 400, 300), [0, 0])
  const [x, y] = pixelToWorld(view, 400 + view.u, 300 - view.u)
  assert.ok(Math.abs(x - 1) < 1e-12 && Math.abs(y - 1) < 1e-12)
  const [cx, cy] = clampTarget(view, 800, 600, [100, -100])
  assert.ok(Math.abs(cx * view.u) <= 400 - 12 + 1e-9)
  assert.ok(Math.abs(cy * view.u) <= 300 - 12 + 1e-9)
  assert.deepEqual(clampTarget(view, 800, 600, [0.5, 0.5]), [0.5, 0.5])
})

test('readoutText(解析解): 届く範囲の中と外で文が変わる。ヤコビアンでは反復の回数と状態が出る', () => {
  const s = createIk()
  const base = { solver: 'analytic', elbowUp: true, lambda: 0.2, maxStep: 0.3 }
  assert.match(readoutText(s, base), /届く$/m)
  s.target = [3, 0]
  assert.match(readoutText(s, base), /届かない/)
  const t = createIk()
  run(t)
  const text = readoutText(t, { ...base, solver: 'jacobian' })
  assert.ok(text.includes(`反復 ${t.iter} 回`))
  assert.ok(text.includes('収束'))
})
