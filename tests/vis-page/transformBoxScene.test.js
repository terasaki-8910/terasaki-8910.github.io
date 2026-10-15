// 段階 1〜3(平行移動・回転と拡大・合成の順)の計算と、つかんだときの座標の変換
// (src/components/visualization/sims/transformBoxScene.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  boxView,
  pointerOnPlane,
  STEP12_CAMERA,
  STEP3_CAMERA,
  STEP1_DEFAULT,
  STEP2_DEFAULT,
  STEP3_DEFAULT,
  step1Model,
  step1Grab,
  step1Drag,
  step2Model,
  step2Pick,
  meanScale,
  rotateHandlePos,
  scaleHandlePos,
  angleFromPlanePoint,
  scaleFromPlanePoint,
  tiltFromDrag,
  step3Model,
  step3Views,
  step3Pick,
  rotateHandle3,
  translationFromCenter,
  angleAround,
  drawStep1,
  drawStep2,
  drawStep3,
  P_MODEL,
  D_MODEL,
} from '../../src/components/visualization/sims/transformBoxScene.js'
import { projectPoint, boxHit } from '../../src/components/visualization/sims/transformMesh.js'
import { multiply, transformPoint, translate } from '../../src/utils/vis/mat4.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
const nearArr = (a, b, tol = 1e-9) => a.length === b.length && a.every((v, i) => near(v, b[i], tol))
const RECT = { left: 0, top: 0, width: 640, height: 300 }

test('段階 1: 位置(w = 1)は平行移動の量だけ動き、向き(w = 0)は動かない', () => {
  const m = step1Model({ tx: 1.2, ty: -0.5, tz: 2 })
  assert.deepEqual(m.pAfter, [P_MODEL[0] + 1.2, P_MODEL[1] - 0.5, P_MODEL[2] + 2, 1])
  assert.deepEqual(m.dAfter, D_MODEL)
  assert.deepEqual([m.T[0][3], m.T[1][3], m.T[2][3], m.T[3][3]], [1.2, -0.5, 2, 1]) // 右端の列が移動量
})

test('段階 1: 箱の中心をつかんで同じ所へ動かしても、移動量は変わらない。ポインタを動かした先に箱の中心が来る', () => {
  const view = boxView(RECT, STEP12_CAMERA)
  const s = STEP1_DEFAULT
  const c = projectPoint(view.VP, [s.tx, s.ty, s.tz], RECT)
  const offset = step1Grab(view, s, c.x, c.y)
  assert.ok(nearArr(offset, [0, 0], 1e-6))
  const same = step1Drag(view, s, offset, c.x, c.y)
  assert.ok(near(same.tx, s.tx, 0.05) && near(same.ty, s.ty, 0.05))
  // 世界の点 (−1, 1.5, 0) の画面の位置へポインタを動かすと、箱の中心がそこに来る
  const target = projectPoint(view.VP, [-1, 1.5, 0], RECT)
  const moved = step1Drag(view, s, offset, target.x, target.y)
  assert.ok(near(moved.tx, -1, 0.051) && near(moved.ty, 1.5, 0.051), `${moved.tx}, ${moved.ty}`)
})

test('段階 1: 動かせる範囲 ±3 m に収まる(画面の端までポインタを動かしても)', () => {
  const view = boxView(RECT, STEP12_CAMERA)
  for (const [x, y] of [[RECT.width - 1, 1], [1, RECT.height - 1], [RECT.width - 1, RECT.height - 1]]) {
    const r = step1Drag(view, STEP1_DEFAULT, [0, 0], x, y)
    assert.ok(Math.abs(r.tx) <= 3 && Math.abs(r.ty) <= 3, `${x}, ${y} → ${r.tx}, ${r.ty}`)
  }
})

test('箱の中心の画面の位置は、箱の上(boxHit)で、はるか外は外', () => {
  const view = boxView(RECT, STEP12_CAMERA)
  const { T } = step1Model(STEP1_DEFAULT)
  const c = projectPoint(view.VP, [1.2, 0.6, 0], RECT)
  assert.equal(boxHit(view.VP, T, RECT, c.x, c.y), true)
  assert.equal(boxHit(view.VP, T, RECT, 3, 3), false)
})

test('段階 2: 回転行列は直交行列で行列式 +1、拡大は対角。p′ = R·S·p', () => {
  const s = { rx: 20, ry: -25, rz: 30, sx: 1.5, sy: 0.8, sz: 1.2 }
  const m = step2Model(s)
  const RtR = multiply(m.R.map((r, i) => m.R.map((_, j) => m.R[j][i])), m.R) // Rᵀ·R
  RtR.forEach((row, i) => row.forEach((v, j) => assert.ok(near(v, i === j ? 1 : 0, 1e-9))))
  const det3 = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  assert.ok(near(det3(m.R), 1, 1e-9))
  assert.deepEqual([m.S[0][0], m.S[1][1], m.S[2][2], m.S[3][3]], [1.5, 0.8, 1.2, 1])
  const byHand = transformPoint(m.R, transformPoint(m.S, P_MODEL))
  assert.ok(nearArr(m.pAfter, byHand, 1e-9))
})

test('段階 2: 取っ手の位置から角度・拡大率を求めると、元の値に戻る', () => {
  for (const a of [-170, -45, 0, 30, 135, 180]) {
    const back = angleFromPlanePoint(rotateHandlePos(a))
    assert.ok(back === a || (a === 180 && back === 180) || Math.abs(Math.abs(back) - 180) < 1e-9, `${a} → ${back}`)
  }
  for (const k of [0.3, 0.75, 1, 1.45, 2]) assert.ok(near(scaleFromPlanePoint(scaleHandlePos(k)), k, 1e-9))
  assert.equal(scaleFromPlanePoint([50, -50, 0]), 2) // 範囲に収まる
  assert.equal(scaleFromPlanePoint([-5, 5, 0]), 0.3)
})

test('段階 2: 取っ手の近くを押すと取っ手が選ばれ、離れていれば選ばれない', () => {
  const view = boxView(RECT, STEP12_CAMERA)
  const rp = projectPoint(view.VP, rotateHandlePos(STEP2_DEFAULT.rz), RECT)
  const sp = projectPoint(view.VP, scaleHandlePos(meanScale(STEP2_DEFAULT)), RECT)
  assert.equal(step2Pick(view, STEP2_DEFAULT, rp.x + 3, rp.y - 2), 'rotate')
  assert.equal(step2Pick(view, STEP2_DEFAULT, sp.x, sp.y), 'scale')
  assert.equal(step2Pick(view, STEP2_DEFAULT, 5, 5), null)
})

test('段階 2: 平面の点から取っ手の位置へ、ポインタの光線が正しく届く(画面 → 平面 z = 0)', () => {
  const view = boxView(RECT, STEP12_CAMERA)
  const hp = rotateHandlePos(60)
  const p = projectPoint(view.VP, hp, RECT)
  const q = pointerOnPlane(view, p.x, p.y, 0)
  assert.ok(nearArr(q, hp, 1e-6))
})

test('段階 2: 箱を右へつかんで動かすと y 軸まわり、下へ動かすと x 軸まわりに回る。±180° に収まる', () => {
  const s = { ...STEP2_DEFAULT, rx: 0, ry: 0 }
  const right = tiltFromDrag(s, 50, 0)
  assert.ok(right.ry > 0 && right.rx === 0)
  const down = tiltFromDrag(s, 0, 50)
  assert.ok(down.rx > 0 && down.ry === 0)
  const wrap = tiltFromDrag({ ...s, ry: 179 }, 20, 0)
  assert.ok(wrap.ry >= -180 && wrap.ry < 180 && wrap.ry < 0, `ry = ${wrap.ry}`)
  // 画面で右へ動かしたとき、箱の手前の面(+z)が右へ回る: R_y(θ)·(0, 0, 1) = (sin θ, 0, cos θ)
  const m = step2Model({ ...s, ry: right.ry })
  assert.ok(transformPoint(m.R, [0, 0, 1, 0])[0] > 0)
})

test('段階 3: T·R·S の箱の中心は移動量 t、S·R·T の中心は s·R·t(同じ T・R・S でも結果が違う)', () => {
  const s = { tx: 1.2, ty: 0.6, rz: 90, s: 2 }
  const trs = step3Model(s, 'trs')
  const srt = step3Model(s, 'srt')
  assert.ok(nearArr(trs.center, [1.2, 0.6, 0], 1e-9))
  // R は 90° なので R·(1.2, 0.6) = (−0.6, 1.2)。s = 2 倍して (−1.2, 2.4)
  assert.ok(nearArr(srt.center, [-1.2, 2.4, 0], 1e-9))
  // 3×3 の部分は同じ(z 軸まわりの回転と一様な拡大は順を入れ替えても同じ)、右端の列だけが違う
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(near(trs.M[i][j], srt.M[i][j], 1e-9))
  assert.ok(!near(trs.M[0][3], srt.M[0][3], 1e-6))
})

test('段階 3: 効く順(右から)と、そのたびの中心。最後の中心は M の中心、最後の 1 つの手前の行列に左から掛けると M', () => {
  const s = STEP3_DEFAULT
  for (const order of ['trs', 'srt']) {
    const m = step3Model(s, order)
    assert.deepEqual(m.appliedNames, [...m.names].reverse())
    assert.ok(nearArr(m.centers[3], transformPoint(m.M, [0, 0, 0, 1]).slice(0, 3), 1e-9))
    const last = { trs: m.T, srt: m.S }[order] // 左端 = 最後に効く行列
    const back = multiply(last, m.ghostM)
    back.forEach((row, i) => row.forEach((v, j) => assert.ok(near(v, m.M[i][j], 1e-9))))
  }
  assert.deepEqual(step3Model(s, 'trs').names, ['T', 'R', 'S'])
  assert.deepEqual(step3Model(s, 'srt').names, ['S', 'R', 'T'])
})

test('段階 3: T·R·S では S と R が中心を動かさない(原点のまま)。S·R·T では T で動く', () => {
  const trs = step3Model(STEP3_DEFAULT, 'trs')
  assert.ok(nearArr(trs.centers[1], [0, 0, 0]) && nearArr(trs.centers[2], [0, 0, 0]))
  const srt = step3Model(STEP3_DEFAULT, 'srt')
  assert.ok(!nearArr(srt.centers[1], [0, 0, 0]))
})

test('段階 3: 中心を q に合わせる移動量は、順を問わず、求めた t で中心が q になる', () => {
  const s = { tx: 0, ty: 0, rz: 40, s: 1.3 }
  const q = [1.1, -0.7, 0]
  for (const order of ['trs', 'srt']) {
    const [tx, ty] = translationFromCenter(order, q, s)
    const m = step3Model({ ...s, tx, ty }, order)
    assert.ok(nearArr(m.center, q, 1e-9), `${order}: ${m.center}`)
  }
})

test('段階 3: 回す取っ手は箱の中心から、いまの角度の向きにある。取っ手の位置から角度が戻る', () => {
  const s = { ...STEP3_DEFAULT, rz: 50 }
  for (const order of ['trs', 'srt']) {
    const m = step3Model(s, order)
    const h = rotateHandle3(m, s)
    assert.equal(angleAround(m.center, h), 50)
  }
})

test('段階 3: 2 つの枠は左右(または上下)で重ならず、取っ手の近くを押せる', () => {
  const [a, b] = step3Views(800, 320, false)
  assert.ok(a.panel.rect.left + a.panel.rect.width <= b.panel.rect.left + 1e-9)
  const s = STEP3_DEFAULT
  const m = step3Model(s, 'trs')
  const h = projectPoint(a.view.VP, rotateHandle3(m, s), a.view.rect)
  assert.equal(step3Pick(a.view, m, s, h.x, h.y), 'rotate')
  assert.equal(step3Pick(a.view, m, s, h.x + 80, h.y), null)
  assert.ok(STEP3_CAMERA.position[2] > 0)
})

// 描いた物を数える ctx(例外なく描けることと、文字・塗りの数を確かめる)
function fakeCtx() {
  const calls = { fill: 0, stroke: 0, text: [] }
  const ctx = {
    fill() { calls.fill++ },
    stroke() { calls.stroke++ },
    fillText(t) { calls.text.push(t) },
  }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'rect', 'clip', 'setLineDash', 'fillRect']) ctx[name] = () => {}
  return { ctx, calls }
}
const COLORS = { ink: 'ink', muted: 'muted', surface: 'surface', accent: 'accent', alpha: (n, a) => `${n}@${a}` }

test('絵: 段階 1 は p・p′・d・d′・t の名前を、段階 2 は取っ手 2 つの名前を、段階 3 は 2 つの枠の名前を描く', () => {
  const a = fakeCtx()
  drawStep1({ ctx: a.ctx, width: 640, height: 300, colors: COLORS }, STEP1_DEFAULT)
  for (const label of ['p', "p'", 'd', "d'", 't']) assert.ok(a.calls.text.includes(label), label)
  const b = fakeCtx()
  drawStep2({ ctx: b.ctx, width: 640, height: 300, colors: COLORS }, STEP2_DEFAULT)
  assert.ok(b.calls.text.includes('回す') && b.calls.text.includes('広げる'))
  const c = fakeCtx()
  drawStep3({ ctx: c.ctx, width: 640, height: 320, colors: COLORS }, STEP3_DEFAULT)
  assert.ok(c.calls.text.some((t) => t.startsWith('T·R·S')) && c.calls.text.some((t) => t.startsWith('S·R·T')))
  for (const stacked of [true, false]) {
    const d = fakeCtx()
    drawStep3({ ctx: d.ctx, width: 360, height: 440, colors: COLORS }, STEP3_DEFAULT, { stacked, active: 1 })
    assert.ok(d.calls.fill > 0)
  }
})

test('translate の単位の確認: step1Model の T は mat4 の translate と同じ', () => {
  const m = step1Model({ tx: 0.3, ty: 0.4, tz: 0.5 })
  assert.deepEqual(m.T, translate(0.3, 0.4, 0.5))
})
