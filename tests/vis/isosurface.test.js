// isosurface.js の性質(補間・陰関数・最小二乗・マーチングスクエア/キューブ・レベルセット)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advectSemiLagrangian2D } from '../../src/utils/vis/grid.js'
import {
  bilinear, cubeCase, cubeCaseClasses, curvature2D, edgeCrossing, gradient2D, interfaceGradientStats, marchingCubes,
  marchingCubesCell, marchingSquares, metaballField, metaballWeight, reinitStep, saddleValue, sampleGrid2D,
  signedDistanceSlottedDisk, solveLinear, squareCase, squareSegments, trilinear, weightedLeastSquares,
} from '../../src/utils/vis/isosurface.js'

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)

test('双線形・3 重線形は角で角の値、1 次関数を正確に再現する', () => {
  close(bilinear(1, 2, 3, 4, 0, 0), 1)
  close(bilinear(1, 2, 3, 4, 1, 1), 4)
  const lin = (x, y, z = 0) => 0.3 + 1.7 * x - 0.4 * y + 2.2 * z
  for (const [a, b] of [[0.2, 0.7], [0.5, 0.5], [0.9, 0.1]]) {
    close(bilinear(lin(0, 0), lin(1, 0), lin(0, 1), lin(1, 1), a, b), lin(a, b))
  }
  const f = Array.from({ length: 8 }, (_, k) => lin(k & 1, (k >> 1) & 1, (k >> 2) & 1))
  close(trilinear(f, 0.3, 0.6, 0.8), lin(0.3, 0.6, 0.8))
  close(trilinear(f, 1, 1, 1), f[7])
  // 格子の上の取り出し
  const nx = 4
  const ny = 3
  const values = Array.from({ length: nx * ny }, (_, i) => lin(i % nx, Math.floor(i / nx)))
  close(sampleGrid2D(values, nx, ny, 1.25, 1.5), lin(1.25, 1.5))
})

test('円の陰関数: 勾配は (2x, 2y)、境界で曲率は 1/r', () => {
  const r = 1.3
  const f = (x, y) => x * x + y * y - r * r
  const g = gradient2D(f, 0.4, -0.9, 1e-4)
  close(g[0], 0.8, 1e-6)
  close(g[1], -1.8, 1e-6)
  for (const t of [0, 1, 2.5]) {
    close(curvature2D(f, r * Math.cos(t), r * Math.sin(t), 1e-3), 1 / r, 1e-3)
  }
})

test('メタボールの重みは中心で 1、半径で 0。2 つの玉は近づくと 1 つにつながる', () => {
  close(metaballWeight(0, 1), 1)
  close(metaballWeight(1, 1), 0)
  assert.ok(metaballWeight(0.5, 1) > 0 && metaballWeight(0.5, 1) < 1)
  const balls = (d) => [{ x: -d / 2, y: 0, R: 1 }, { x: d / 2, y: 0, R: 1 }]
  const T = 0.4
  // 真ん中は両方から r = d/2。W(0.5) = 0.75³ ≈ 0.42 が 2 つで T を超え、W(0.8) = 0.36³ ≈ 0.047 が 2 つでは超えない
  assert.ok(metaballField([0, 0], balls(1.0), T) > 0) // 近いと真ん中も内側(1 つにつながる)
  assert.ok(metaballField([0, 0], balls(1.6), T) < 0) // 遠いと離れる
  assert.ok(metaballField([0.8, 0], balls(1.6), T) > 0) // それぞれの玉の中心は内側
})

test('最小二乗: 2 次式のデータからは係数がそのまま戻る。連立方程式も解ける', () => {
  const xs = Array.from({ length: 15 }, (_, i) => -2 + (4 * i) / 14)
  const q = 0.5
  const gs = xs.map((x) => 1.5 - 0.7 * (x - q) + 0.3 * (x - q) ** 2)
  const fit = weightedLeastSquares(xs, gs, q, 0.8)
  close(fit.c[0], 1.5, 1e-9)
  close(fit.c[1], -0.7, 1e-9)
  close(fit.c[2], 0.3, 1e-9)
  const x = solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3])
  close(x[0], 2, 1e-12)
  close(x[1], 3, 1e-12)
  close(x[2], -1, 1e-12)
})

test('辺の交点は、1 次関数なら正確', () => {
  const f = (t) => -0.6 + 1.5 * t
  close(edgeCrossing(f(0), f(1), 0), 0.4)
  close(edgeCrossing(f(0), f(1), 0.3), 0.6)
})

test('マーチングスクエア: 16 通りの番号と、円の等値線は閉じていて円から O(h²) 以内', () => {
  assert.equal(squareCase(1, 0, 0, 0, 0.5), 1)
  assert.equal(squareCase(0, 0, 1, 1, 0.5), 12)
  for (const n of [17, 33]) {
    const r = 0.6
    const h = 2 / (n - 1)
    const values = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values.push(r * r - ((-1 + i * h) ** 2 + (-1 + j * h) ** 2))
    const { segments } = marchingSquares(values, n, n, 0)
    // 端点の重なり: どの端点もちょうど 2 本の線分が共有する(閉じた輪)
    const count = new Map()
    let maxErr = 0
    for (const s of segments) {
      for (const p of s) {
        const key = `${p[0].toFixed(9)},${p[1].toFixed(9)}`
        count.set(key, (count.get(key) ?? 0) + 1)
        maxErr = Math.max(maxErr, Math.abs(Math.hypot(-1 + p[0] * h, -1 + p[1] * h) - r))
      }
    }
    for (const c of count.values()) assert.equal(c, 2)
    assert.ok(maxErr < 0.6 * h * h / r + 1e-9, `誤差 ${maxErr}`)
  }
})

test('鞍点の値は双線形関数の鞍点での値。あいまいなマスの線は、どちらの決め方でも 2 本', () => {
  const [f00, f10, f01, f11] = [1.0, -0.8, -0.6, 0.7]
  const d = f00 - f10 - f01 + f11
  const us = (f00 - f01) / d
  const vs = (f00 - f10) / d
  close(saddleValue(f00, f10, f01, f11), bilinear(f00, f10, f01, f11, us, vs))
  assert.equal(squareSegments(f00, f10, f11, f01, 0).length, 2)
  assert.equal(squareSegments(f00, f10, f11, f01, 0, { ambiguity: 'center' }).length, 2)
})

test('漸近線判定: 鞍点の値が T 以上なら T 未満の角を切り取り、未満なら T 以上の角を切り取る', () => {
  // 線の中点にいちばん近い角 = その線が切り取る角
  const cut = (segs) => segs.map(([p, q]) => [Math.round((p[0] + q[0]) / 2), Math.round((p[1] + q[1]) / 2)]).sort()
  // 内側(T 以上)は左下と右上。鞍点の値 0.4 ≥ 0 → 内側はマスの中でつながり、線は右下と左上の角を切り取る
  assert.ok(saddleValue(1, -0.2, -0.2, 1) > 0)
  assert.deepEqual(cut(squareSegments(1, -0.2, 1, -0.2, 0)), [[0, 1], [1, 0]])
  // 鞍点の値が負: 内側の角(左下と右上)をそれぞれ切り取る(内側どうしは離れている)
  assert.ok(saddleValue(0.2, -1, -1, 0.2) < 0)
  assert.deepEqual(cut(squareSegments(0.2, -1, 0.2, -1, 0)), [[0, 0], [1, 1]])
})

test('256 通りすべてで、立方体の中の面の頂点は符号の変わる辺の上にあり、輪は閉じている', () => {
  for (let c = 0; c < 256; c++) {
    const f = Array.from({ length: 8 }, (_, k) => (c & (1 << k) ? 1 : -1) * (0.5 + 0.1 * k))
    assert.equal(cubeCase(f, 0), c)
    const { loops, points } = marchingCubesCell(f, 0)
    let edges = 0
    for (const loop of loops) {
      assert.ok(loop.length >= 3)
      edges += loop.length
    }
    assert.equal(edges, points.size)
    for (const p of points.values()) {
      const onEdge = p.filter((v) => v === 0 || v === 1).length
      assert.equal(onEdge, 2) // 3 つの座標のうち 2 つが 0 か 1(辺の上)
    }
  }
})

test('球の場をマーチングキューブで取り出すと、閉じた面(どの辺も 2 つの三角形)で、面積は 4πr² の 2% 以内', () => {
  const n = 33
  const r = 0.7
  const h = 2 / (n - 1)
  const values = new Float64Array(n * n * n)
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    values[i + n * (j + n * k)] = r * r - ((-1 + i * h) ** 2 + (-1 + j * h) ** 2 + (-1 + k * h) ** 2)
  }
  const { positions, triangles, normals } = marchingCubes(values, n, n, n, 0)
  const edgeCount = new Map()
  let area = 0
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
    }
    const A = positions[a]
    const B = positions[b]
    const C = positions[c]
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    area += 0.5 * Math.hypot(...cr) * h * h
    // 三角形は外向き: 右ねじの法線が中心からの向きと同じ側
    const m = [(A[0] + B[0] + C[0]) / 3 * h - 1, (A[1] + B[1] + C[1]) / 3 * h - 1, (A[2] + B[2] + C[2]) / 3 * h - 1]
    assert.ok(cr[0] * m[0] + cr[1] * m[1] + cr[2] * m[2] > 0)
  }
  for (const c of edgeCount.values()) assert.equal(c, 2)
  assert.equal(positions.length - edgeCount.size + triangles.length, 2) // オイラー標数(球)
  assert.ok(Math.abs(area - 4 * Math.PI * r * r) < 0.02 * 4 * Math.PI * r * r)
  // 法線は外向きで長さ 1
  const p = positions[0]
  const out = [p[0] * h - 1, p[1] * h - 1, p[2] * h - 1]
  assert.ok(normals[0][0] * out[0] + normals[0][1] * out[1] + normals[0][2] * out[2] > 0)
})

test('256 通りを回転でまとめると 23 組、内外の入れ替えもまとめると 15 組', () => {
  assert.equal(cubeCaseClasses().count, 23)
  const { count, classOf } = cubeCaseClasses({ complement: true })
  assert.equal(count, 15)
  assert.equal(classOf[0], classOf[255])
  assert.equal(classOf[1], classOf[128]) // 角 1 つ(どの角でも同じ組)
})

test('レベルセット: 距離でない φ を再初期化すると、境界の近くで |∇φ| が 1 に近づき、0 の線はほとんど動かない', () => {
  const n = 64
  const dx = 1 / n
  const r = 0.25
  let phi = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * dx - 0.5
    const y = (j + 0.5) * dx - 0.5
    phi[i + n * j] = 3 * (x * x + y * y - r * r) // 距離ではない(傾きが 1 でない)
  }
  const phi0 = phi.slice()
  const before = interfaceGradientStats(phi, n, dx, 3 * dx)
  assert.ok(before.deviation > 0.3)
  let next = new Float64Array(n * n)
  for (let it = 0; it < 120; it++) {
    reinitStep(phi, phi0, n, dx, 0.5 * dx, next)
    ;[phi, next] = [next, phi]
  }
  const after = interfaceGradientStats(phi, n, dx, 3 * dx)
  assert.ok(Math.abs(after.mean - 1) < 0.05, `平均 ${after.mean}`)
  // 0 の線の位置: x 軸の上で符号が変わる所
  const j = n / 2
  let crossing = null
  for (let i = n / 2; i < n - 1; i++) {
    const a = phi[i + n * j]
    const b = phi[i + 1 + n * j]
    if (a < 0 && b >= 0) crossing = (i + 0.5 + a / (a - b)) * dx - 0.5
  }
  const y = (j + 0.5) * dx - 0.5
  assert.ok(Math.abs(crossing - Math.sqrt(r * r - y * y)) < dx)
})

test('切れ込みのある円板の距離は、中で負、外で正。回転で運んでも面積はほとんど変わらない', () => {
  const disk = { cx: 0.5, cy: 0.6, r: 0.2, slotWidth: 0.06, slotTop: 0.7 }
  assert.ok(signedDistanceSlottedDisk(0.5, 0.75, disk) < 0) // 切れ込みの上の、円の中
  assert.ok(signedDistanceSlottedDisk(0.5, 0.5, disk) > 0) // 切れ込みの中
  assert.ok(signedDistanceSlottedDisk(0.9, 0.9, disk) > 0)
  const n = 96
  const dx = 1 / n
  let phi = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) phi[i + n * j] = signedDistanceSlottedDisk((i + 0.5) * dx, (j + 0.5) * dx, disk)
  const area = (p) => p.reduce((s, v) => s + (v < 0 ? 1 : 0), 0)
  const a0 = area(phi)
  const u = new Float64Array(n * n)
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    u[i + n * j] = -2 * Math.PI * ((j + 0.5) * dx - 0.5) / 4
    v[i + n * j] = 2 * Math.PI * ((i + 0.5) * dx - 0.5) / 4
  }
  let next = new Float64Array(n * n)
  for (let s = 0; s < 120; s++) { // 4 秒で 1 周の速さで 1 秒(1/4 周)
    advectSemiLagrangian2D(phi, u, v, n, dx, 1 / 120, next)
    ;[phi, next] = [next, phi]
  }
  assert.ok(Math.abs(area(phi) - a0) < 0.1 * a0)
})
