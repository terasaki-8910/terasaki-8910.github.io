// 段階 4〜6(透視投影・視錐台とクリッピング・ビューポート変換)の計算と、つかんだときの座標の変換
// (src/components/visualization/sims/transformPerspective.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STEP4_DEFAULT,
  STEP5_DEFAULT,
  STEP6_DEFAULT,
  S4,
  S5,
  S6,
  step4View,
  step4Image,
  step4Rows,
  step4Handles,
  step4Drag,
  step4Nudge,
  frustumShape,
  clipInfo,
  naiveImageY,
  step5View,
  step5Handles,
  step5Drag,
  step5Nudge,
  viewportInverse,
  step6Pixel,
  step6Panels,
  step6Handles,
  step6Drag,
  step6Nudge,
  ndcPanelView,
  windowPanelView,
  drawStep4,
  drawStep5,
  drawStep6,
} from '../../src/components/visualization/sims/transformPerspective.js'
import { pickHandle } from '../../src/components/visualization/sims/transformHandles.js'
import { viewport } from '../../src/utils/vis/projection.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

// ---- 段階 4 ----
test('段階 4: 像の高さは y′ = f·y/z。同じ高さでも z が 2 倍なら像は半分、f を 2 倍にすると像も 2 倍', () => {
  assert.ok(near(step4Image([4, 1], 1.5), 1.5 * 1 / 4))
  assert.ok(near(step4Image([8, 1], 1.5), step4Image([4, 1], 1.5) / 2))
  assert.ok(near(step4Image([4, 1], 3), step4Image([4, 1], 1.5) * 2))
  assert.ok(near(step4Image([4, -1], 1.5), -step4Image([4, 1], 1.5))) // 下の点は下に写る
  const rows = step4Rows(STEP4_DEFAULT)
  assert.deepEqual(rows.map((r) => r.name), ['P', 'Q'])
  assert.ok(rows[0].image < rows[1].image) // 初期値は P の方が遠く、同じ高さなので、像は小さい
})

test('段階 4: 取っ手の位置へポインタを動かすと、その点が動かない(丸めの範囲)。範囲の外は端に切る', () => {
  const view = step4View(640, 320)
  const hs = step4Handles(view, STEP4_DEFAULT)
  for (const id of ['P', 'Q']) {
    const h = hs.find((x) => x.id === id)
    const r = step4Drag(view, id, h.x, h.y)
    assert.ok(near(r[id][0], STEP4_DEFAULT[id][0], 0.051) && near(r[id][1], STEP4_DEFAULT[id][1], 0.051), `${id}: ${r[id]}`)
  }
  const plane = hs.find((x) => x.id === 'plane')
  assert.ok(near(step4Drag(view, 'plane', plane.x, plane.y).f, STEP4_DEFAULT.f, 0.051))
  const far = step4Drag(view, 'P', -1000, -1000)
  assert.ok(far.P[0] >= S4.Z[0] && far.P[1] <= S4.YLIM)
  assert.equal(step4Drag(view, 'plane', 99999, 0).f, S4.F[1])
})

test('段階 4: 矢印キーの動き。z は範囲に収まり、投影面は f を動かす', () => {
  const r = step4Nudge(STEP4_DEFAULT, 'P', -100, 0)
  assert.equal(r.P[0], S4.Z[0])
  assert.ok(near(step4Nudge(STEP4_DEFAULT, 'plane', 0.5, 0).f, 2))
})

// ---- 段階 5 ----
test('段階 5: 視錐台の内側の点は insideClip で内側、far より奥・視野角の外・near より手前は外側', () => {
  const s = { ...STEP5_DEFAULT } // fov 50°、near 1.5、far 7
  assert.equal(clipInfo(s, [4.5, 1]).inside, true)
  assert.deepEqual(clipInfo(s, [9, 0]).reasons, ['far'])
  assert.deepEqual(clipInfo(s, [4.5, 3]).reasons, ['fov'])
  assert.deepEqual(clipInfo(s, [1, 0]).reasons, ['near'])
  assert.deepEqual(clipInfo(s, [-2, 0]).reasons, ['behind'])
})

test('段階 5: 視錐台の縁(視野角の辺)のすぐ内側は内側、すぐ外側は外側', () => {
  const s = { ...STEP5_DEFAULT }
  const { t } = frustumShape(s)
  const d = 4
  assert.equal(clipInfo(s, [d, d * t * 0.999]).inside, true)
  assert.equal(clipInfo(s, [d, d * t * 1.001]).inside, false)
  assert.ok(near(frustumShape(s).farHalf, s.far * Math.tan((50 * Math.PI) / 360)))
})

test('段階 5: カメラの後ろの点は w_c < 0。先に w_c で割ると、NDC の範囲(−1〜1)の中に収まって前に出てしまう', () => {
  const s = { ...STEP5_DEFAULT }
  const info = clipInfo(s, [-3, 0.4])
  assert.ok(info.w < 0 && info.behind && !info.inside)
  assert.ok(Math.abs(info.ndc[1]) <= 1, `割った y_ndc = ${info.ndc[1]}`)
  // 上にある点(y > 0)が、割ると下に写る(符号が反転する)
  assert.ok(info.ndc[1] < 0)
  // near の面の上の像の高さ(絵に描く位置)も、同じ符号
  assert.ok(naiveImageY(s, info) < 0)
  // 前にある同じ高さの点は、符号が正
  assert.ok(clipInfo(s, [3, 0.4]).ndc[1] > 0)
})

test('段階 5: つかむ・動かす: near・far は順序を保ち、視野角の取っ手は縁の辺の上で、引いた先の角度になる', () => {
  const view = step5View(640, 320)
  const s = STEP5_DEFAULT
  const hs = step5Handles(view, s)
  const fovH = hs.find((h) => h.id === 'fov')
  assert.ok(Math.abs(step5Drag(view, s, 'fov', fovH.x, fovH.y).fovDeg - s.fovDeg) <= 1)
  // 取っ手を画面の上へ引くと視野角が広がり、下げると狭まる
  assert.ok(step5Drag(view, s, 'fov', fovH.x, fovH.y - 40).fovDeg > s.fovDeg)
  assert.ok(step5Drag(view, s, 'fov', fovH.x, fovH.y + 20).fovDeg < s.fovDeg)
  const nearH = hs.find((h) => h.id === 'near')
  const farH = hs.find((h) => h.id === 'far')
  assert.ok(step5Drag(view, s, 'near', farH.x + 200, nearH.y).near <= s.far - S5.FAR_MIN_GAP)
  assert.ok(step5Drag(view, s, 'far', nearH.x - 200, farH.y).far >= s.near + S5.FAR_MIN_GAP)
  assert.ok(step5Drag(view, s, 'far', 99999, farH.y).far <= S5.FAR_MAX)
  // 点は範囲の中
  const p = step5Drag(view, s, 'P', -1000, -1000)
  assert.ok(p.P[0] >= S5.D[0] && Math.abs(p.P[1]) <= S5.YLIM)
  assert.ok(step5Nudge(s, 'fov', 0, 1).fovDeg > s.fovDeg)
})

test('取っ手の選び方: 半径の内側で一番近い物。前にあるものが優先ではなく近さが先', () => {
  const hs = [{ id: 'a', x: 10, y: 10, r: 16 }, { id: 'b', x: 20, y: 10, r: 16 }]
  assert.equal(pickHandle(hs, 11, 10).id, 'a')
  assert.equal(pickHandle(hs, 19, 10).id, 'b')
  assert.equal(pickHandle(hs, 100, 100), null)
})

// ---- 段階 6 ----
test('段階 6: 画素の座標は viewport の値で、ウィンドウの大きさを変えても、同じ割合の位置になる', () => {
  const s = { ndc: [0.3, -0.4], W: 400, H: 300 }
  const p = step6Pixel(s)
  assert.deepEqual([p.x, p.y], viewport(s.ndc, 0, 0, 400, 300))
  assert.ok(near(p.fx, 0.65) && near(p.fy, 0.3))
  for (const [W, H] of [[200, 100], [640, 480], [123, 77]]) {
    const q = step6Pixel({ ...s, W, H })
    assert.ok(near(q.x / W, p.fx, 1e-12) && near(q.y / H, p.fy, 1e-12))
  }
})

test('段階 6: viewportInverse は viewport の逆(範囲の外は端に切る)', () => {
  for (const ndc of [[-1, -1], [1, 1], [0.25, -0.7], [0, 0]]) {
    const back = viewportInverse(viewport(ndc, 0, 0, 400, 300), 400, 300)
    assert.ok(near(back[0], ndc[0], 1e-12) && near(back[1], ndc[1], 1e-12))
  }
  assert.deepEqual(viewportInverse([9999, -9999], 400, 300), [1, -1])
})

test('段階 6: 左右の枠の座標は往復で戻る(画面 ↔ NDC、画面 ↔ 画素)', () => {
  const { ndc, win } = step6Panels(640, 320, false)
  const nv = ndcPanelView(ndc.rect)
  assert.ok(near(nv.wx(nv.sx(0.37)), 0.37, 1e-12) && near(nv.wy(nv.sy(-0.62)), -0.62, 1e-12))
  const wv = windowPanelView(win.rect, 300, 200)
  assert.ok(near(wv.px(wv.sx(123)), 123, 1e-9) && near(wv.py(wv.sy(77)), 77, 1e-9))
  // 左下が原点: 画素 (0, 0) は枠の左下
  assert.equal(wv.sx(0), wv.left)
  assert.equal(wv.sy(0), wv.bottom)
  // ウィンドウは枠からはみ出さない(最大の 640 × 480)
  const big = windowPanelView(win.rect, 640, 480)
  assert.ok(big.right <= win.rect.left + win.rect.width && big.top >= win.rect.top)
})

test('段階 6: 左の点をつかんでも、右の点をつかんでも、同じ NDC の点になる。角をつかむとウィンドウの大きさが変わる', () => {
  for (const stacked of [false, true]) {
    const [w, h] = stacked ? [360, 460] : [640, 320]
    const s = STEP6_DEFAULT
    const hs = step6Handles(w, h, stacked, s)
    const a = hs.find((x) => x.id === 'ndc')
    const b = hs.find((x) => x.id === 'pix')
    const ra = step6Drag(w, h, stacked, s, 'ndc', a.x, a.y)
    const rb = step6Drag(w, h, stacked, s, 'pix', b.x, b.y)
    assert.ok(near(ra.ndc[0], s.ndc[0], 0.011) && near(ra.ndc[1], s.ndc[1], 0.011), `${stacked} 左 ${ra.ndc}`)
    assert.ok(near(rb.ndc[0], s.ndc[0], 0.011) && near(rb.ndc[1], s.ndc[1], 0.011), `${stacked} 右 ${rb.ndc}`)
    const c = hs.find((x) => x.id === 'size')
    const rc = step6Drag(w, h, stacked, s, 'size', c.x, c.y)
    assert.ok(near(rc.W, s.W, 10) && near(rc.H, s.H, 10), `${stacked} 角 ${rc.W}, ${rc.H}`)
    const small = step6Drag(w, h, stacked, s, 'size', 0, 9999)
    assert.equal(small.W, S6.W[0])
    assert.equal(small.H, S6.H[0])
  }
  assert.equal(step6Nudge(STEP6_DEFAULT, 'ndc', 100, 0).ndc[0], 1)
})

// 描いた物を数える ctx
function fakeCtx() {
  const calls = { fill: 0, stroke: 0, text: [] }
  const ctx = {
    fill() { calls.fill++ },
    stroke() { calls.stroke++ },
    fillText(t) { calls.text.push(t) },
    measureText: (t) => ({ width: String(t).length * 7 }),
  }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'rect', 'clip', 'setLineDash', 'fillRect', 'strokeRect']) ctx[name] = () => {}
  return { ctx, calls }
}
const COLORS = { ink: 'ink', muted: 'muted', surface: 'surface', accent: 'accent', alpha: (n, a) => `${n}@${a}` }

test('絵: 段階 4・5・6 が例外なく描け、名前と単位が出る', () => {
  const a = fakeCtx()
  drawStep4({ ctx: a.ctx, width: 640, height: 320, colors: COLORS }, STEP4_DEFAULT, { active: 'P' })
  for (const t of ['P', "P'", 'Q', "Q'", 'z [m]', 'y [m]', '投影面']) assert.ok(a.calls.text.includes(t), t)
  const b = fakeCtx()
  drawStep5({ ctx: b.ctx, width: 640, height: 320, colors: COLORS }, STEP5_DEFAULT)
  assert.ok(b.calls.text.some((t) => t.startsWith('P：内')))
  assert.ok(b.calls.text.some((t) => t.startsWith('Q：後ろ')))
  assert.ok(b.calls.text.some((t) => t.startsWith('Q を先に割った像')))
  for (const stacked of [false, true]) {
    const c = fakeCtx()
    drawStep6({ ctx: c.ctx, width: stacked ? 360 : 640, height: stacked ? 460 : 320, colors: COLORS }, STEP6_DEFAULT, { stacked, active: 'size' })
    assert.ok(c.calls.text.includes('x_s [px]') && c.calls.text.includes('x_n'))
  }
})
