// mesh.js と render.js(z バッファの描画とシャドウマップ)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dot, normalize } from '../../src/utils/vis/vec3.js'
import { faceNormal } from '../../src/utils/vis/shading.js'
import { gridPlane, uvSphere } from '../../src/utils/vis/mesh.js'
import { cameraViewProjection, projectVertex, renderDepthMap, renderScene, shadowLookup } from '../../src/utils/vis/render.js'

test('UV 球: 面はどれも外を向き(反時計回り)、頂点は半径の上', () => {
  const { positions, faces, normals } = uvSphere(1.5, 16, 8, [0, 1, 0])
  for (const p of positions) {
    const d = Math.hypot(p[0], p[1] - 1, p[2])
    assert.ok(Math.abs(d - 1.5) < 1e-12)
  }
  for (const [i, j, k] of faces) {
    const n = faceNormal(positions[i], positions[j], positions[k])
    const c = normalize([(positions[i][0] + positions[j][0] + positions[k][0]) / 3, (positions[i][1] + positions[j][1] + positions[k][1]) / 3 - 1, (positions[i][2] + positions[j][2] + positions[k][2]) / 3])
    assert.ok(dot(n, c) > 0.5)
  }
  assert.equal(normals.length, positions.length)
  assert.equal(faces.length, 2 * 16 + 2 * 16 * (8 - 2))
})

test('床: 面はどれも上(+y)を向く', () => {
  const { positions, faces } = gridPlane(6, 4)
  assert.equal(positions.length, 25)
  for (const [i, j, k] of faces) assert.ok(faceNormal(positions[i], positions[j], positions[k])[1] > 0.999)
})

const W = 96
const H = 72
function scene(lightPosition) {
  const sphere = uvSphere(1, 24, 12, [0, 1, 0])
  const floor = gridPlane(6, 12, 0)
  return {
    meshes: [
      { ...sphere, material: { color: [0.8, 0.3, 0.3] } },
      { ...floor, material: { color: [0.7, 0.7, 0.7] } },
    ],
    light: { position: lightPosition, intensity: 1 },
    ambient: 0.1,
    environment: (d, rgb) => { rgb[0] = rgb[1] = rgb[2] = 0.9; return rgb },
  }
}
const camera = { eye: [0, 2.2, 5.5], target: [0, 0.9, 0], fov: (40 * Math.PI) / 180 }
const lum = (out, x, y) => {
  const i = (y * W + x) * 4
  return out[i] + out[i + 1] + out[i + 2]
}
const pixelOf = (p) => {
  const v = projectVertex(cameraViewProjection(camera, W / H), p, W, H)
  return [Math.floor(v[0]), Math.floor(v[1])]
}

test('光の当たる側の球は、反対側より明るい', () => {
  const out = new Uint8ClampedArray(W * H * 4)
  for (const shading of ['flat', 'gouraud', 'phong']) {
    renderScene(scene([4, 3, 0]), camera, { width: W, height: H, shading, model: 'blinn-phong', shadows: false }, out)
    const [lx, ly] = pixelOf([0.7, 1.3, 0.6])
    const [dx, dy] = pixelOf([-0.7, 1.3, 0.6])
    assert.ok(lum(out, lx, ly) > lum(out, dx, dy) + 60, shading)
  }
})

test('球の影の中の床は、影の外の床より暗い。影を切ると差が消える', () => {
  const out = new Uint8ClampedArray(W * H * 4)
  const light = [0, 6, 0] // 真上: 影は球の真下
  const opts = { width: W, height: H, shading: 'phong', model: 'lambert', shadowSize: 256, shadowTarget: [0, 0, 0] }
  // 球の真下は見えないので、影の中(z = 0.6)と、影の外(z = 1.8。影の半径は 6 tan(asin(1/5)) ≈ 1.22)の床を比べる
  const [ix, iy] = pixelOf([0, 0, 0.6])
  const [ox, oy] = pixelOf([0, 0, 1.8])
  assert.ok(oy < H)
  renderScene(scene(light), camera, { ...opts, shadows: true }, out)
  const shadowed = lum(out, ix, iy)
  const litFar = lum(out, ox, oy)
  renderScene(scene(light), camera, { ...opts, shadows: false }, out)
  const unshadowed = lum(out, ix, iy)
  assert.ok(shadowed < unshadowed - 60)
  assert.ok(litFar > shadowed)
})

test('影の表: 光源の真下の球の上面は近く、床は遠い。表の外は null', () => {
  const s = scene([0, 6, 0])
  const map = renderDepthMap(s, { eye: [0, 6, 0], target: [0, 0, 0], up: [0, 0, -1], fov: 1.2 }, 128)
  const top = shadowLookup(map, [0, 2, 0])
  assert.ok(Math.abs(top.dC - 4) < 1e-6)
  assert.ok(Math.abs(top.dL - 4) < 0.05)
  const floorUnder = shadowLookup(map, [0, 0, 0])
  assert.ok(floorUnder.dL < floorUnder.dC - 1) // 床の点より手前に球がある
  assert.equal(shadowLookup(map, [100, 0, 0]), null)
})

test('カメラの光線: 真ん中は視線の向きで、光線の上の点はその画素に写る', async () => {
  const { cameraRay } = await import('../../src/utils/vis/render.js')
  const cam = { eye: [0, 2, 5], target: [0, 1, 0], fov: 0.8 }
  const aspect = 4 / 3
  const center = cameraRay(cam, aspect, 0, 0)
  const f = normalize([0, -1, -5])
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(center.dir[k] - f[k]) < 1e-12)
  const W = 400
  const H = 300
  const VP = cameraViewProjection(cam, aspect)
  for (const [nx, ny] of [[0.5, 0.25], [-0.8, -0.6]]) {
    const r = cameraRay(cam, aspect, nx, ny)
    const p = [0, 1, 2].map((i) => r.origin[i] + 3 * r.dir[i])
    const v = projectVertex(VP, p, W, H)
    assert.ok(Math.abs(v[0] - ((nx + 1) / 2) * W) < 1e-6)
    assert.ok(Math.abs(v[1] - ((1 - ny) / 2) * H) < 1e-6)
  }
})
