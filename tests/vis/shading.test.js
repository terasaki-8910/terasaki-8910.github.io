// shading.js・vec3.js の性質(反射モデルの式と影の判定)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cross, dot, length, normalize } from '../../src/utils/vis/vec3.js'
import {
  beckmannD, blinnPhongSpecular, chebyshevUpperBound, cookTorranceSpecular, faceNormal, fresnelSchlick, geometryG,
  halfVector, inShadow, lambert, phongSpecular, reflect, reflectIncident, refract, vertexNormals,
} from '../../src/utils/vis/shading.js'
import { uvSphere } from '../../src/utils/vis/mesh.js'

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)
const unitAt = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0] // y 軸から x の側へ deg 度
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))))

test('外積は両方に直交し、長さは平行四辺形の面積', () => {
  const a = [1, 2, 3]
  const b = [-2, 0.5, 4]
  const c = cross(a, b)
  close(dot(c, a), 0)
  close(dot(c, b), 0)
  const area = Math.sqrt(dot(a, a) * dot(b, b) - dot(a, b) ** 2)
  close(length(c), area, 1e-12)
})

test('反時計回りの三角形の法線は +z、並びを逆にすると −z', () => {
  const n = faceNormal([0, 0, 0], [1, 0, 0], [0, 1, 0])
  assert.deepEqual(n.map((v) => Math.round(v * 1e12) / 1e12), [0, 0, 1])
  const m = faceNormal([0, 0, 0], [0, 1, 0], [1, 0, 0])
  close(m[2], -1)
})

test('24 分割の球の頂点の法線(面の法線の平均)は、中心からの向きと 0.05 以内', () => {
  const { positions, faces } = uvSphere(1, 24, 12)
  const normals = vertexNormals(positions, faces)
  for (let i = 0; i < positions.length; i++) {
    const exact = normalize(positions[i])
    assert.ok(length([normals[i][0] - exact[0], normals[i][1] - exact[1], normals[i][2] - exact[2]]) < 0.05)
  }
})

test('ランバートは cos θ で、裏から当たる光は 0', () => {
  const N = [0, 1, 0]
  for (const deg of [0, 30, 60, 89]) close(lambert(N, unitAt(deg)), Math.cos((deg * Math.PI) / 180), 1e-12)
  assert.equal(lambert(N, [0, -1, 0]), 0)
})

test('正反射 R は N との角が L と同じで長さ 1、L と同じ平面にある', () => {
  const N = normalize([0.2, 1, 0.1])
  const L = normalize([0.7, 0.4, -0.3])
  const R = reflect(L, N)
  close(length(R), 1, 1e-12)
  close(dot(R, N), dot(L, N), 1e-12)
  close(dot(cross(N, L), R), 0, 1e-12)
})

test('同じ平面では、R と V の角は N と H の角のちょうど 2 倍(だからブリン-フォンは m を約 4 倍にする)', () => {
  const N = [0, 1, 0]
  for (const [l, v] of [[40, -10], [25, 35], [-50, 20]]) {
    const L = unitAt(l)
    const V = unitAt(v)
    const R = reflect(L, N)
    const H = halfVector(L, V)
    close(angle(R, V), 2 * angle(N, H), 1e-12)
  }
  // 広がりをそろえる: 中心の近くで (cos 2α)^m と (cos α)^{4m} はほぼ同じ
  const m = 20
  const a = 0.05
  close(Math.cos(2 * a) ** m, Math.cos(a) ** (4 * m), 1e-3)
})

test('フォン・ブリン-フォンは正反射の向きで最大、光が裏からなら 0', () => {
  const N = [0, 1, 0]
  const L = unitAt(30)
  const R = reflect(L, N)
  close(phongSpecular(N, L, R, 16), 1, 1e-12)
  close(blinnPhongSpecular(N, L, R, 16), 1, 1e-12)
  assert.ok(phongSpecular(N, L, unitAt(10), 16) < 1)
  assert.equal(phongSpecular(N, [0, -1, 0], [0, 1, 0], 16), 0)
  assert.equal(blinnPhongSpecular(N, [0, -1, 0], [0, 1, 0], 16), 0)
})

test('Beckmann の D は、cos α を掛けて半球で積分すると 1', () => {
  for (const m of [0.1, 0.2, 0.35, 0.6]) {
    const steps = 200000
    let sum = 0
    for (let i = 0; i < steps; i++) {
      const a = ((i + 0.5) / steps) * (Math.PI / 2)
      sum += beckmannD(Math.cos(a), m) * Math.cos(a) * Math.sin(a)
    }
    close(sum * (Math.PI / 2 / steps) * 2 * Math.PI, 1, 1e-3)
  }
})

test('G は 0〜1 で、L = V = N のとき 1', () => {
  const N = [0, 1, 0]
  close(geometryG(N, N, N, N), 1, 1e-12)
  for (const [l, v] of [[10, 20], [70, -80], [85, 85], [-30, 60]]) {
    const L = unitAt(l)
    const V = unitAt(v)
    const g = geometryG(N, L, V, halfVector(L, V))
    assert.ok(g >= 0 && g <= 1)
  }
})

test('Schlick のフレネルは真正面で F0、すれすれで 1', () => {
  close(fresnelSchlick(0.04, 1), 0.04, 1e-12)
  close(fresnelSchlick(0.04, 0), 1, 1e-12)
  assert.ok(fresnelSchlick(0.04, 0.5) > 0.04)
})

test('クック-トランスは 0 以上で、粗さを大きくすると正反射の向きでの値が小さくなる', () => {
  const N = [0, 1, 0]
  const L = unitAt(35)
  const V = reflect(L, N)
  const sharp = cookTorranceSpecular(N, L, V, 0.1, 0.04)
  const rough = cookTorranceSpecular(N, L, V, 0.5, 0.04)
  assert.ok(sharp > rough && rough > 0)
  assert.equal(cookTorranceSpecular(N, [0, -1, 0], V, 0.3, 0.04), 0)
})

test('屈折はスネルの法則を満たし、全反射で null、η = 1 なら曲がらない', () => {
  const N = [0, 1, 0]
  const eta = 1 / 1.5 // 空気 → ガラス
  for (const deg of [10, 30, 60, 80]) {
    const I = [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180), 0] // 上から斜めに入る
    const T = refract(I, N, eta)
    close(length(T), 1, 1e-12)
    const sinT = Math.abs(T[0])
    close(1.0 * Math.sin((deg * Math.PI) / 180), 1.5 * sinT, 1e-12)
  }
  // ガラス → 空気で、臨界角(約 41.8°)より浅いと全反射
  const inside = [Math.sin((50 * Math.PI) / 180), -Math.cos((50 * Math.PI) / 180), 0]
  assert.equal(refract(inside, N, 1.5), null)
  const I = normalize([0.3, -1, 0.2])
  const T = refract(I, N, 1)
  for (let k = 0; k < 3; k++) close(T[k], I[k], 1e-12)
})

test('入ってくる光の反射は、面に沿った成分を保ち、垂直な成分を逆にする', () => {
  const N = [0, 1, 0]
  const I = normalize([0.6, -0.8, 0])
  const R = reflectIncident(I, N)
  close(R[0], I[0], 1e-12)
  close(R[1], -I[1], 1e-12)
})

test('影の判定と、チェビシェフの上限', () => {
  assert.equal(inShadow(5, 3, 0.05), true)
  assert.equal(inShadow(3.02, 3, 0.05), false)
  close(chebyshevUpperBound(2, 4.1, 1.5), 1, 0)
  const near = chebyshevUpperBound(2, 4.1, 2.2)
  const far = chebyshevUpperBound(2, 4.1, 3)
  assert.ok(near <= 1 && far < near && far > 0)
})
