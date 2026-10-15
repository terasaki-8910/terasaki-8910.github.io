// 箱・投影した点・画面の点の逆変換・当たり判定(src/components/visualization/sims/transformMesh.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOX_VERTS,
  BOX_FACES,
  BOX_EDGES,
  projectPoint,
  ndcFromPixel,
  boxFaces,
  boxHit,
  drawBoxes,
  drawAxes3d,
  inRect,
} from '../../src/components/visualization/sims/transformMesh.js'
import { identity, translate, scale, rotateY, compose } from '../../src/utils/vis/mat4.js'
import { lookAtPose, cameraMatrices } from '../../src/components/visualization/sims/transformCamera.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
const deg = (d) => (d * Math.PI) / 180
const RECT = { left: 20, top: 30, width: 320, height: 240 }
const pose = lookAtPose([3, 2, 7], [0, 0, 0])
const { VP } = cameraMatrices(pose, { fov: deg(50), aspect: RECT.width / RECT.height, near: 0.5, far: 30 })

test('箱は 8 頂点・6 面・12 辺で、どの面も 4 頂点、どの辺も 2 つの面に挟まれる', () => {
  assert.equal(BOX_VERTS.length, 8)
  assert.equal(BOX_FACES.length, 6)
  assert.equal(BOX_EDGES.length, 12)
  for (const [a, b] of BOX_EDGES) {
    const shared = BOX_FACES.filter((f) => f.includes(a) && f.includes(b))
    assert.equal(shared.length, 2)
  }
})

test('projectPoint: 見る点は枠の中央。カメラの後ろは null', () => {
  const p = projectPoint(VP, [0, 0, 0], RECT)
  assert.ok(near(p.x, RECT.left + RECT.width / 2, 1e-6) && near(p.y, RECT.top + RECT.height / 2, 1e-6))
  assert.equal(projectPoint(VP, [0, 0, 20], RECT), null)
})

test('projectPoint: 上の点は画面でも上(y が小さい)、右の点は右', () => {
  const o = projectPoint(VP, [0, 0, 0], RECT)
  assert.ok(projectPoint(VP, [0, 1, 0], RECT).y < o.y)
  assert.ok(projectPoint(VP, [-1, 0, 1], RECT).x < o.x)
})

test('ndcFromPixel は projectPoint の x, y の逆', () => {
  const p = projectPoint(VP, [0.7, -0.3, 0.2], RECT)
  const [nx, ny] = ndcFromPixel(RECT, p.x, p.y)
  assert.ok(near(nx, p.ndc[0], 1e-9) && near(ny, p.ndc[1], 1e-9))
})

test('箱の表の面は、立方体を外から見ると 1〜3 枚(向かい合う面は同時に表にならない)', () => {
  for (const yaw of [0, 30, 100, 200]) {
    const M = compose(rotateY(deg(yaw)), scale(1, 1, 1))
    const fronts = boxFaces(VP, M, RECT).filter((f) => f.front).map((f) => f.face)
    assert.ok(fronts.length >= 1 && fronts.length <= 3, `yaw ${yaw}: ${fronts}`)
    for (const [a, b] of [[0, 1], [2, 3], [4, 5]]) assert.ok(!(fronts.includes(a) && fronts.includes(b)))
  }
})

test('boxHit: 箱の中心はつかめて、遠く離れた所はつかめない', () => {
  const c = projectPoint(VP, [0, 0, 0], RECT)
  assert.equal(boxHit(VP, identity(), RECT, c.x, c.y), true)
  assert.equal(boxHit(VP, identity(), RECT, RECT.left + 3, RECT.top + 3), false)
  // 箱を動かすと、当たる場所も動く
  const moved = translate(2, 0, 0)
  const m = projectPoint(VP, [2, 0, 0], RECT)
  assert.equal(boxHit(VP, moved, RECT, m.x, m.y), true)
  assert.equal(boxHit(VP, moved, RECT, c.x - 80, c.y), false)
})

test('inRect', () => {
  assert.equal(inRect(RECT, 25, 40), true)
  assert.equal(inRect(RECT, 5, 40), false)
})

// 描いた線の本数などを覚える ctx(描画が例外を出さないことと、面の数を確かめる)
function fakeCtx() {
  const calls = { fill: 0, stroke: 0, text: [] }
  const ctx = {
    fill() { calls.fill++ },
    stroke() { calls.stroke++ },
    fillText(t) { calls.text.push(t) },
  }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'rect', 'clip', 'setLineDash']) ctx[name] = () => {}
  return { ctx, calls }
}
const COLORS = { ink: 'ink', muted: 'muted', alpha: (n, a) => `${n}@${a}` }

test('drawBoxes: 表の面は塗って、ghost は塗らない', () => {
  const a = fakeCtx()
  drawBoxes(a.ctx, VP, RECT, [{ M: identity(), fill: 'f', stroke: 's' }], COLORS)
  const fronts = boxFaces(VP, identity(), RECT).filter((f) => f.front).length
  assert.equal(a.calls.fill, fronts)
  assert.equal(a.calls.stroke, 6) // 表も裏も輪郭を描く
  const b = fakeCtx()
  drawBoxes(b.ctx, VP, RECT, [{ M: identity(), stroke: 's', ghost: true }], COLORS)
  assert.equal(b.calls.fill, 0)
  assert.equal(b.calls.stroke, 1)
})

test('drawAxes3d: 軸の名前に単位が付く', () => {
  const a = fakeCtx()
  drawAxes3d(a.ctx, VP, RECT, COLORS, { len: 2, unit: 'm' })
  assert.deepEqual(a.calls.text.sort(), ['x [m]', 'y [m]', 'z [m]'])
})
