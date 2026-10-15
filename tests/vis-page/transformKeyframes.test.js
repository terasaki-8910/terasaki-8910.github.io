// 見せ方「補間」(src/components/visualization/sims/transformKeyframes.js)の、補間の値と座標の変換を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KF_DEFAULT,
  KF_TIMES,
  T_END,
  VALUE_LIMIT,
  buildModel,
  clampValue,
  inPlot,
  pickKeyframe,
  plotRect,
  readoutText,
  sample,
  timeToX,
  valueToY,
  xToTime,
  yToValue,
} from '../../src/components/visualization/sims/transformKeyframes.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

test('キーフレームの時刻では、線形補間も自然 3 次スプラインもキーフレームの値を通る', () => {
  const model = buildModel(KF_DEFAULT)
  KF_TIMES.forEach((t, i) => {
    const s = sample(model, t)
    assert.ok(near(s.lerp, KF_DEFAULT[i]), `lerp t=${t}`)
    assert.ok(near(s.spline, KF_DEFAULT[i], 1e-9), `spline t=${t}`)
  })
})

test('線形補間の値: 区間の中点は両端の平均。同じ値が並ぶ区間では一定(スプラインは一定にならない)', () => {
  const model = buildModel(KF_DEFAULT)
  assert.ok(near(sample(model, 0.5).lerp, (KF_DEFAULT[0] + KF_DEFAULT[1]) / 2))
  // 1 s〜2.2 s は両端とも 0.75
  let splineMax = 0
  for (let t = 1; t <= 2.2; t += 0.05) {
    assert.ok(near(sample(model, t).lerp, 0.75))
    splineMax = Math.max(splineMax, Math.abs(sample(model, t).spline - 0.75))
  }
  assert.ok(splineMax > 0.02, `スプラインが同じ値の区間でふくらむ(最大 ${splineMax})`)
})

test('キーフレームを動かすと、スプラインが変わる(buildModel は ys から作り直す)', () => {
  const ys = KF_DEFAULT.slice()
  ys[2] = -0.5
  const model = buildModel(ys)
  assert.ok(near(sample(model, KF_TIMES[2]).spline, -0.5))
  assert.ok(near(sample(model, KF_TIMES[2]).lerp, -0.5))
  assert.notEqual(sample(model, 1.6).spline, sample(buildModel(KF_DEFAULT), 1.6).spline)
})

test('座標の変換: 時刻と x、値と y はそれぞれ往復で戻る。xToTime は範囲に収める', () => {
  const r = plotRect(800, 600)
  for (const t of [0, 1.7, T_END]) assert.ok(near(xToTime(r, timeToX(r, t)), t))
  for (const v of [-1, 0, 0.42, 1]) assert.ok(near(yToValue(r, valueToY(r, v)), v))
  assert.equal(xToTime(r, r.left - 100), 0)
  assert.equal(xToTime(r, r.right + 100), T_END)
  assert.ok(valueToY(r, 1) < valueToY(r, -1)) // 値が大きいほど上(y が小さい)
})

test('pickKeyframe: つかめる半径の内側で、いちばん近い点の番号。外は -1。inPlot は枠の中', () => {
  const r = plotRect(800, 600)
  const ys = KF_DEFAULT
  for (let i = 0; i < ys.length; i++) {
    assert.equal(pickKeyframe(r, ys, timeToX(r, KF_TIMES[i]), valueToY(r, ys[i])), i)
    assert.equal(pickKeyframe(r, ys, timeToX(r, KF_TIMES[i]) + 10, valueToY(r, ys[i]) - 10), i)
  }
  assert.equal(pickKeyframe(r, ys, timeToX(r, 1.6), valueToY(r, 1.5)), -1)
  assert.ok(inPlot(r, (r.left + r.right) / 2, (r.top + r.bottom) / 2))
  assert.ok(!inPlot(r, r.left - 50, r.top + 10))
  assert.ok(!inPlot(r, r.left + 10, r.bottom + 50))
})

test('clampValue: キーフレームの値を [-1, 1] に収め、0.01 刻みにする', () => {
  assert.equal(clampValue(3), VALUE_LIMIT)
  assert.equal(clampValue(-3), -VALUE_LIMIT)
  assert.equal(clampValue(0.12345), 0.12)
  assert.equal(clampValue(0.004), 0)
})

test('readoutText: 時刻・2 つの補間の値・選んでいるキーフレームの番号が出る', () => {
  const model = buildModel(KF_DEFAULT)
  const [line1, line2] = readoutText(model, 1, 1).split('\n')
  assert.match(line1, /t = 1\.00 s\s+lerp = 0\.75\s+spline = 0\.75/)
  assert.match(line2, /キーフレーム 2\/6/)
})
