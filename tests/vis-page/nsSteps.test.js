import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CELLS, DX1, STEP_N, STAGES, clamp, cellAt, cellX, maxAbs, hasBlownUp,
  pulseBounds, pulseHasLeft, exactPulse, createLine, probeCells, advanceLine, paintLine,
  emptyField, forcePoint, applyForce, createPressure, recomputePressure, pushPressure,
  createSplit, stepSplit, advanceSplit,
} from '../../src/components/visualization/sims/nsSteps.js'
import { fieldView, lineView, inside } from '../../src/components/visualization/sims/nsStepDraw.js'
import { createWorld, DT, NU_DEFAULT, pushAt } from '../../src/components/visualization/sims/nsWorld.js'
import { fluidStep2D, divergence2D } from '../../src/utils/vis/grid.js'

const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const sum = (v) => v.reduce((a, b) => a + b, 0) * DX1

test('NS段階: 32×32でも1 m四方で、中心座標の初期条件と発散0を保つ', () => {
  const w = createWorld({ n: STEP_N })
  assert.equal(w.n, 32); assert.equal(w.dx, 1 / 32)
  for (const key of ['u', 'v', 'dye']) assert.equal(w[key].length, 32 ** 2)
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const y = (j + 0.5) / 32, profile = Math.tanh((y <= 0.5 ? y - 0.25 : 0.75 - y) * 30)
    near(w.u[i + 32 * j], profile / 2)
    near(w.v[i + 32 * j], 0.025 * Math.sin(2 * Math.PI * (i + 0.5) / 32))
    near(w.dye[i + 32 * j], (profile + 1) / 2)
  }
  near(maxAbs(divergence2D(w.u, w.v, w.n, w.dx)), 0)
  assert.equal(createWorld().n, 64)
})

test('外力: 静止したマスの中心はF·t_p、方向は正規化、端は周期的につながる', () => {
  const w = emptyField(), p = forcePoint(0, 0)
  assert.equal(p.k, 0)
  for (let i = 0; i < 60; i++) applyForce(w, p, 8)
  near(w.u[0], 8); near(w.v[0], 0)
  near(w.u[1], w.u[31]); near(w.u[32], w.u[32 * 31])
  const other = emptyField(), q = forcePoint(0.5, 0.5)
  applyForce(other, q, 8 * 3, [3, 4])
  near(Math.hypot(other.u[q.k], other.v[q.k]), 24 * DT)
  near(other.v[q.k] / other.u[q.k], 4 / 3)
  applyForce(other, q, 0, [0, 0])
  near(Math.hypot(other.u[q.k], other.v[q.k]), 24 * DT)
  assert.equal(forcePoint(1, 1).k, 32 ** 2 - 1)
})

test('移流: 40個のマスの中心に方形波、負のcでは左右反転する', () => {
  const a = createLine('advect', 0.5), b = createLine('advect', -0.5)
  assert.equal(a.values.length, CELLS)
  assert.equal(DX1, 0.025)
  assert.deepEqual(a.values, b.values.slice().reverse())
  assert.equal(a.values.reduce((x, y) => x + y, 0), 8)
  for (let i = 0; i < CELLS; i++) {
    near(cellX(i), (i + 0.5) / CELLS)
    assert.equal(a.values[i], +(cellX(i) >= 0.15 && cellX(i) <= 0.35))
  }
  assert.deepEqual(pulseBounds(0.5, 1), [0.65, 0.85])
  const exact = exactPulse(-0.5, 1)
  near(exact[1][0], 0.15); near(exact[3][0], 0.35)
  assert.deepEqual(exact.map((p) => p[1]), [0, 0, 1, 1, 0, 0])
})

test('移流: プローブの補間元と風上マスは正負のc・境界・大きなCFLに対応する', () => {
  const dt = 2.5 * DX1
  assert.deepEqual(probeCells(10, 1, dt, 'semi').cells, [7, 8])
  assert.deepEqual(probeCells(10, -1, dt, 'semi').cells, [12, 13])
  near(probeCells(10, 1, dt, 'semi').back, cellX(10) - dt)
  assert.deepEqual(probeCells(10, 1, dt, 'upwind').cells, [10, 9])
  assert.deepEqual(probeCells(10, -1, dt, 'upwind').cells, [10, 11])
  assert.deepEqual(probeCells(0, 1, dt, 'semi').cells, [0, 1])
  assert.deepEqual(probeCells(39, -1, dt, 'semi').cells, [39, 39])
  assert.deepEqual(probeCells(0, 1, dt, 'upwind').cells, [0, 0])
  assert.deepEqual(probeCells(39, -1, dt, 'upwind').cells, [39, 39])
  assert.equal(cellAt(-1), 0); assert.equal(cellAt(1), 39)
  assert.equal(clamp(3, -1, 1.5), 1.5)
})

test('移流: Δt未満では動かず、実時間の蓄積ごとに1段進む', () => {
  const w = createLine('advect'), initial = w.values.slice()
  const params = { kind: 'advect', c: 0.5, dt: 1 / 12, method: 'semi' }
  advanceLine(w, 0.04, params)
  assert.equal(w.time, 0); assert.deepEqual(w.values, initial)
  advanceLine(w, 1 / 12 - 0.04, params)
  near(w.time, 1 / 12); assert.notDeepEqual(w.values, initial); near(w.acc, 0)
  advanceLine(w, 1 / 6, params)
  near(w.time, 0.25)
})

test('移流: 厳密解が完全に出たら初期状態へ戻る、c=0では戻らない', () => {
  for (const c of [-1, 1]) {
    assert.equal(pulseHasLeft(c, 0.84), false)
    assert.equal(pulseHasLeft(c, 0.85), true)
    const w = createLine('advect', c)
    advanceLine(w, 0.85, { kind: 'advect', c, dt: 0.025 })
    near(w.time, 0)
    assert.deepEqual(w.values, createLine('advect', c).values)
  }
  assert.equal(pulseHasLeft(0, 100), false)
  const w = createLine('advect', 0)
  advanceLine(w, 2, { kind: 'advect', c: 0 })
  near(w.time, 2); assert.deepEqual(w.values, createLine('advect', 0).values)
})

test('発散: 1e6超・NaN・Infinityを検出し、移流の風上差分と粘性はその状態で止まる', () => {
  assert.equal(hasBlownUp(Float64Array.from([-1e6, 1e6])), false)
  for (const v of [1e6 + 1, -1e6 - 1, NaN, Infinity]) assert.equal(hasBlownUp(Float64Array.of(v)), true)
  for (const params of [
    { kind: 'advect', c: 1, dt: 1 / 12, method: 'upwind' },
    { kind: 'diffuse', nu: 0.025 },
  ]) {
    const w = createLine(params.kind, params.c)
    advanceLine(w, 10, params)
    assert.equal(w.diverged, true)
    const before = w.values.slice(), time = w.time
    advanceLine(w, 1, params)
    assert.deepEqual(w.values, before); assert.equal(w.time, time)
    assert.equal(createLine(params.kind).diverged, false)
  }
  const semi = createLine('advect', 1)
  advanceLine(semi, 10, { kind: 'advect', c: 1, dt: 1 / 12 })
  assert.equal(semi.diverged, false); assert.ok(maxAbs(semi.values) <= 1)
})

test('粘性: 安定な更新は和を保存し、ν=0は変化せず、ドラッグは途中のマスも塗る', () => {
  const w = createLine('diffuse'), initial = w.values.slice()
  near(sum(w.values), 0.2)
  advanceLine(w, 1, { kind: 'diffuse', nu: 0 })
  assert.deepEqual(w.values, initial)
  advanceLine(w, 2, { kind: 'diffuse', nu: 0.005 })
  near(sum(w.values), 0.2); assert.ok(maxAbs(w.values) < 1)
  paintLine(w, { x: 0.1, y: 1 }, { x: 0.3, y: 1 })
  for (let i = 4; i <= 12; i++) assert.equal(w.values[i], 1)
  assert.equal(w.selected, 12)
  const paintedSum = sum(w.values)
  advanceLine(w, 1, { kind: 'diffuse', nu: 0.005 })
  near(sum(w.values), paintedSum)
  paintLine(w, { x: 1, y: -3 }, { x: 1, y: -3 })
  assert.equal(w.values[39], -1)
  w.diverged = true
  const before = w.values.slice()
  paintLine(w, { x: 0, y: 0 }, { x: 1, y: 0 })
  assert.deepEqual(w.values, before)
})

test('圧力: 回数0は元の速度、60回は発散が減り、修正矢印は差分に等しい', () => {
  const w = createPressure(0)
  assert.equal(w.iterations, 0); assert.deepEqual(w.before.u, w.after.u)
  const before = w.before.u.slice()
  recomputePressure(w, 60)
  assert.equal(w.iterations, 60); assert.deepEqual(w.before.u, before)
  assert.ok(maxAbs(w.divAfter) < maxAbs(w.divBefore) * 0.1)
  for (let k = 0; k < 32 ** 2; k++) {
    near(w.correction.u[k], w.after.u[k] - w.before.u[k])
    near(w.correction.v[k], w.after.v[k] - w.before.v[k])
  }
  const after = w.after.u.slice()
  recomputePressure(w, 60)
  assert.deepEqual(w.after.u, after)
})

test('圧力: 反復回数と押しを変えても色尺度は初期状態から動かない', () => {
  const w = createPressure(), scales = [w.divScale, w.qScale]
  const before = w.before.u.slice()
  pushPressure(w, 0.9, 0.2, 4, -3, 200)
  assert.equal(w.iterations, 200)
  assert.notDeepEqual(w.before.u, before)
  assert.deepEqual([w.divScale, w.qScale], scales)
  recomputePressure(w, 0)
  assert.deepEqual(w.after.u, w.before.u)
  assert.deepEqual([w.divScale, w.qScale], scales)
  assert.deepEqual([createPressure(0).divScale, createPressure(200).qScale], scales)
})

test('時間変化: 外力→移流→粘性→圧力、圧力の後だけnとtを増やす', () => {
  assert.deepEqual(STAGES, ['外力', '移流', '粘性', '圧力'])
  const w = createSplit(), initial = w.field.u.slice()
  stepSplit(w)
  assert.equal(w.cursor, 1); assert.equal(w.steps, 0); assert.equal(w.field.time, 0)
  assert.deepEqual(w.field.u, initial); assert.equal(w.maxDelta, 0)
  for (let i = 2; i <= 3; i++) {
    stepSplit(w); assert.equal(w.cursor, i); assert.equal(w.steps, 0)
  }
  stepSplit(w)
  assert.equal(w.cursor, 0); assert.equal(w.steps, 1); assert.equal(w.field.time, DT)
  const expected = createWorld({ n: STEP_N })
  fluidStep2D(expected, { dt: DT, nu: NU_DEFAULT, iterations: 60 })
  for (const key of ['u', 'v', 'dye']) assert.deepEqual(w.field[key], expected[key])
})

test('時間変化: 予約した押しは次の外力まで待ち、一度だけpushAtで適用される', () => {
  const w = createSplit()
  stepSplit(w) // 外力の段を通り過ぎてから予約
  w.pending.push({ x: 0.5, y: 0.4, fx: 2, fy: -1 }, { x: 0.9, y: 0.9, fx: -1, fy: 3 })
  const pending = w.pending.slice()
  for (let i = 0; i < 3; i++) { stepSplit(w); assert.equal(w.pending.length, 2) }
  const expected = { ...w.field, u: w.field.u.slice(), v: w.field.v.slice(), dye: w.field.dye.slice() }
  const before = { u: w.field.u.slice(), v: w.field.v.slice() }
  for (const p of pending) pushAt(expected, p.x, p.y, p.fx, p.fy, 0.2)
  stepSplit(w)
  assert.equal(w.pending.length, 0)
  for (const key of ['u', 'v', 'dye']) assert.deepEqual(w.field[key], expected[key])
  let largest = 0
  for (let k = 0; k < w.field.u.length; k++) {
    near(w.delta.u[k], w.field.u[k] - before.u[k])
    near(w.delta.v[k], w.field.v[k] - before.v[k])
    largest = Math.max(largest, Math.hypot(w.delta.u[k], w.delta.v[k]))
  }
  near(w.maxDelta, largest); assert.ok(largest > 0)
})

test('時間変化: 再生は実時間1秒につき8段、リセットで予約・差分・時刻を消す', () => {
  const w = createSplit()
  advanceSplit(w, 0.124)
  assert.equal(w.cursor, 0)
  advanceSplit(w, 0.001)
  assert.equal(w.cursor, 1)
  advanceSplit(w, 0.875)
  assert.equal(w.cursor, 0); assert.equal(w.steps, 2); near(w.field.time, 2 * DT)
  const fresh = createSplit()
  assert.equal(fresh.pending.length, 0); assert.equal(fresh.maxDelta, 0)
  assert.equal(fresh.steps, 0); assert.equal(fresh.acc, 0); assert.equal(fresh.field.time, 0)
})

test('NS段階の座標変換: 狭いcanvasでも1m領域・軸・プローブを枠内に収める', () => {
  // 375px画面で左右余白を差し引いた幅から、横長PCの幅まで。
  for (const width of [280, 327, 375, 680, 960]) {
    for (const height of [220, 300, 360]) {
      for (const view of [fieldView(width, height), lineView(width, height), lineView(width, height, true)]) {
        assert.ok(view.frame.left >= 0 && view.frame.right <= width)
        assert.ok(view.frame.top >= 0 && view.frame.bottom + 34 <= height)
        near(view.wx(view.sx(0.5)), 0.5)
        assert.equal(inside(view, { x: view.sx(0.5), y: view.sy(0.5) }), true)
        assert.equal(inside(view, { x: -1, y: -1 }), false)
      }
      const view = lineView(width, height)
      assert.ok(view.frame.bottom + 49 + 16 <= height)
    }
  }
})
