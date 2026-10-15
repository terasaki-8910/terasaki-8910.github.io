// 軌道カメラの姿勢・視錐台の隅・画面の点から出る光線(src/components/visualization/sims/transformCamera.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  orbitPose,
  lookAtPose,
  cameraMatrices,
  frustumCorners,
  pixelRay,
  rayPlaneZ,
} from '../../src/components/visualization/sims/transformCamera.js'
import { multiply, transformPoint } from '../../src/utils/vis/mat4.js'
import { projectPoint, ndcFromPixel } from '../../src/components/visualization/sims/transformMesh.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
const nearArr = (a, b, tol = 1e-9) => a.length === b.length && a.every((v, i) => near(v, b[i], tol))
const deg = (d) => (d * Math.PI) / 180

test('V は世界をカメラの座標系にする: カメラの位置は原点、見る点は正面(0, 0, −dist)', () => {
  const pose = orbitPose({ target: [0, 0.3, 0], yaw: deg(35), pitch: deg(20), dist: 6 })
  assert.ok(nearArr(transformPoint(pose.V, [...pose.position, 1]), [0, 0, 0, 1], 1e-9))
  assert.ok(nearArr(transformPoint(pose.V, [0, 0.3, 0, 1]), [0, 0, -6, 1], 1e-9))
})

test('Vinv は V の逆行列', () => {
  const pose = orbitPose({ target: [1, -0.5, 2], yaw: deg(-70), pitch: deg(-15), dist: 4 })
  const I = multiply(pose.V, pose.Vinv)
  I.forEach((row, i) => row.forEach((v, j) => assert.ok(near(v, i === j ? 1 : 0, 1e-9))))
})

test('位置の式: 方位角 0・仰角 0 なら見る点の +z 側 dist のところ。方位角 90° なら +x 側', () => {
  assert.ok(nearArr(orbitPose({ target: [0, 0, 0], yaw: 0, pitch: 0, dist: 5 }).position, [0, 0, 5]))
  assert.ok(nearArr(orbitPose({ target: [0, 0, 0], yaw: deg(90), pitch: 0, dist: 5 }).position, [5, 0, 0], 1e-9))
  assert.ok(nearArr(orbitPose({ target: [0, 0, 0], yaw: 0, pitch: deg(90), dist: 5 }).position, [0, 5, 0], 1e-9))
})

test('lookAtPose: 位置と見る点から作ったカメラは、その位置にあり、見る点を正面に置く', () => {
  const pos = [2, 1.2, 5.5]
  const target = [0, 0.3, 0]
  const pose = lookAtPose(pos, target)
  assert.ok(nearArr(pose.position, pos, 1e-9))
  const d = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2])
  assert.ok(near(pose.dist, d))
  assert.ok(nearArr(transformPoint(pose.V, [...target, 1]), [0, 0, -d, 1], 1e-9))
})

test('lookAtPose: 真上から見ても壊れない(方位角は 0)。真上の点はカメラの座標で上に出る', () => {
  const pose = lookAtPose([0, 4, 0], [0, 0, 0])
  assert.ok(near(pose.dist, 4))
  assert.ok(nearArr(transformPoint(pose.V, [0, 0, 0, 1]), [0, 0, -4, 1], 1e-9))
})

test('上の物は画面でも上: 見る点より +y の点は、カメラの座標の y が正', () => {
  const pose = lookAtPose([3, 1, 5], [0, 0.3, 0])
  const above = transformPoint(pose.V, [0, 1.3, 0, 1])
  assert.ok(above[1] > 0)
})

test('視錐台の隅: 距離 depth の面の 4 隅を投影すると、NDC の x, y がちょうど ±1', () => {
  const pose = lookAtPose([2, 1.2, 5.5], [0, 0.3, 0])
  const spec = { fov: deg(45), aspect: 1.6 }
  const { VP } = cameraMatrices(pose, { ...spec, near: 0.5, far: 30 })
  const rect = { left: 0, top: 0, width: 160, height: 100 }
  const corners = frustumCorners(pose, spec, 6)
  const expected = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  corners.forEach((c, i) => {
    const p = projectPoint(VP, c, rect)
    assert.ok(near(p.ndc[0], expected[i][0], 1e-9) && near(p.ndc[1], expected[i][1], 1e-9), `隅 ${i}`)
  })
})

test('画面の点から出る光線は、床(z = 一定の面)で交わり、その点を投影すると元の画面の点に戻る', () => {
  const pose = lookAtPose([2, 1.2, 5.5], [0, 0.3, 0])
  const spec = { fov: deg(45), aspect: 1.25 }
  const { VP } = cameraMatrices(pose, { ...spec, near: 0.5, far: 30 })
  const rect = { left: 10, top: 20, width: 250, height: 200 }
  for (const [px, py] of [[135, 120], [60, 70], [220, 180]]) {
    const [nx, ny] = ndcFromPixel(rect, px, py)
    const hit = rayPlaneZ(pixelRay(pose, spec, nx, ny), 0.4)
    assert.ok(hit && near(hit[2], 0.4))
    const back = projectPoint(VP, hit, rect)
    assert.ok(near(back.x, px, 1e-6) && near(back.y, py, 1e-6), `(${px}, ${py}) → (${back.x}, ${back.y})`)
  }
})

test('光線が平面と平行、または平面がカメラの後ろなら交点なし', () => {
  const pose = orbitPose({ target: [0, 0, 0], yaw: deg(90), pitch: 0, dist: 5 }) // +x 側から −x を見る
  const ray = pixelRay(pose, { fov: deg(45), aspect: 1 }, 0, 0)
  assert.equal(rayPlaneZ(ray, 1), null) // 光線は z 一定(平面と平行)
  const front = orbitPose({ target: [0, 0, 0], yaw: 0, pitch: 0, dist: 5 })
  assert.equal(rayPlaneZ(pixelRay(front, { fov: deg(45), aspect: 1 }, 0, 0), 9), null) // 平面はカメラの後ろ
})
