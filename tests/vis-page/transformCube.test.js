// 見せ方「変換・投影」(src/components/visualization/sims/transformCube.js)の、行列の組み立てと、描く辺の選び方を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CUBE_DEFAULTS, cubeMatrices, drawCube, formatMatrix } from '../../src/components/visualization/sims/transformCube.js'
import { ASPECT } from '../../src/components/visualization/sims/transformCommon.js'
import { transformPoint } from '../../src/utils/vis/mat4.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

// 線を引くたびに、そのときの線の色・太さ・破線を覚える ctx
function fakeCtx() {
  const strokes = []
  const ctx = {
    strokeStyle: '',
    lineWidth: 1,
    dash: [],
    setLineDash(d) {
      this.dash = d
    },
    stroke() {
      strokes.push({ style: this.strokeStyle, width: this.lineWidth, dash: this.dash })
    },
  }
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'fillText', 'save', 'restore']) ctx[name] = () => {}
  return { ctx, strokes }
}

// 色の名前がそのまま分かる colors(alpha は「名前@不透明度」)
const COLORS = { ink: 'ink', muted: 'muted', alpha: (name, a) => `${name}@${a}` }

function draw(params) {
  const { ctx, strokes } = fakeCtx()
  drawCube({ ctx, width: 640, height: 480, colors: COLORS }, { ...CUBE_DEFAULTS, ...params })
  // モデルの軸は、実線で太さ 1.5 の muted。残りが立方体の辺
  const axes = strokes.filter((s) => s.width === 1.5 && s.style === 'muted' && s.dash.length === 0)
  const edges = strokes.filter((s) => !axes.includes(s))
  return { edges, axes, strokes }
}

const FRONT = 'ink' // 表の辺の色
const BACK = 'ink@0.3' // 背面の辺の色
const FACING = { rx: 0, ry: 0, rz: 0, tx: 0, ty: 0, tz: 0 } // 回転なし・原点。カメラは +z 側から -z を見る

test('正面から見る: 表の面は +z の 1 面だけで、表の辺 4 本・背面の辺 8 本。軸は 3 本', () => {
  const { edges, axes } = draw(FACING)
  assert.equal(edges.length, 12)
  assert.equal(edges.filter((e) => e.style === FRONT).length, 4)
  assert.equal(edges.filter((e) => e.style === BACK).length, 8)
  assert.equal(axes.length, 3)
})

test('ふつうに回した立方体(既定の姿勢): 辺は 12 本で、表の辺は見える面の数(1・2・3 面)に応じた 4・7・9 本のどれか', () => {
  const { edges } = draw({})
  assert.equal(edges.length, 12)
  const front = edges.filter((e) => e.style === FRONT).length
  const back = edges.filter((e) => e.style === BACK).length
  assert.equal(front + back, 12)
  assert.ok([4, 7, 9].includes(front), `表の辺 ${front} 本`)
  assert.ok(front >= 7, '既定の姿勢は 2 面以上が見える')
})

test('y まわりに 180° 回しても(箱は対称)、表の辺 4 本・背面の辺 8 本', () => {
  const { edges } = draw({ ...FACING, ry: 180 })
  assert.equal(edges.filter((e) => e.style === FRONT).length, 4)
  assert.equal(edges.filter((e) => e.style === BACK).length, 8)
})

test('視錐台の外に出た辺は破線になる(far を立方体より手前に縮める)', () => {
  assert.equal(draw(FACING).edges.filter((e) => e.dash.length > 0).length, 0)
  const clipped = draw({ ...FACING, near: 1, far: 5.5 }) // カメラ z=7 から 5.5 より奥(z < 1.5)は外
  assert.ok(clipped.edges.filter((e) => e.dash.length > 0).length > 0)
})

test('cubeMatrices: 掛ける順で M が変わる。TRS は平行移動がそのまま、SRT は拡大を受ける', () => {
  const base = { ...CUBE_DEFAULTS, ...FACING, tx: 1, s: 2 }
  const trs = cubeMatrices({ ...base, order: 'trs' }, ASPECT).M
  const srt = cubeMatrices({ ...base, order: 'srt' }, ASPECT).M
  assert.ok(near(trs[0][0], 2) && near(trs[0][3], 1))
  assert.ok(near(srt[0][0], 2) && near(srt[0][3], 2)) // 平行移動が先に拡大される
  assert.ok(near(transformPoint(trs, [0, 0, 0, 1])[0], 1))
  assert.ok(near(transformPoint(srt, [0, 0, 0, 1])[0], 2))
})

test('cubeMatrices: ビュー行列はモデルの原点をカメラの前(z = -7)に置く。formatMatrix は 4×4 を 4 行にし、-0.00 を出さない', () => {
  const { MVP, V } = cubeMatrices({ ...CUBE_DEFAULTS, ...FACING, s: 1 }, ASPECT)
  assert.ok(near(transformPoint(V, [0, 0, 0, 1])[2], -7))
  assert.ok(transformPoint(MVP, [0, 0, 0, 1])[3] > 0) // クリップ座標の w > 0 = カメラの前
  const rows = formatMatrix([
    [-0.001, 1, 0, 2.5],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ])
  assert.equal(rows.length, 4)
  assert.ok(rows.every((r) => !r.includes('-0.00')))
  assert.ok(rows[0].includes('2.50'))
})
