// raster.js の重心座標と三角形の塗り(左上の決まり)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barycentric, rasterTriangle } from '../../src/utils/vis/raster.js'

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)

test('重心座標は和が 1 で、点を再現する。角では 1 つだけが 1', () => {
  const a = [0.3, 0.1]
  const b = [5.2, 1.7]
  const c = [1.4, 4.9]
  const p = [2.1, 2.2]
  const [l0, l1, l2] = barycentric(p, a, b, c)
  close(l0 + l1 + l2, 1)
  close(l0 * a[0] + l1 * b[0] + l2 * c[0], p[0])
  close(l0 * a[1] + l1 * b[1] + l2 * c[1], p[1])
  assert.deepEqual(barycentric(b, a, b, c).map((v) => Math.round(v * 1e12) / 1e12), [0, 1, 0])
})

test('正方形を 2 つの三角形に分けて塗ると、画素は全部ちょうど 1 回ずつ', () => {
  const W = 37
  const H = 23
  const count = new Uint8Array(W * H)
  const hit = (x, y) => { count[y * W + x]++ }
  // 画素の境目にぴったり乗る正方形(辺の上の画素の中心が出る)と、半端な位置の正方形の両方で
  for (const [x0, y0, x1, y1] of [[3, 2, 19, 18], [4.5, 1.5, 30.5, 21.5], [0, 0, W, H]]) {
    count.fill(0)
    const p00 = [x0, y0]
    const p10 = [x1, y0]
    const p01 = [x0, y1]
    const p11 = [x1, y1]
    rasterTriangle(p00, p10, p11, W, H, hit)
    rasterTriangle(p00, p11, p01, W, H, hit)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cx = x + 0.5
        const cy = y + 0.5
        const inside = cx >= x0 && cx < x1 && cy >= y0 && cy < y1
        assert.equal(count[y * W + x], inside ? 1 : 0, `画素 (${x}, ${y})`)
      }
    }
  }
})

test('扇形に分けた多角形でも、どの画素も 2 回は塗らない(頂点の並びの向きによらない)', () => {
  const W = 40
  const H = 40
  const count = new Uint8Array(W * H)
  const center = [20.25, 19.75]
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = (2 * Math.PI * i) / 9
    return [20 + 15 * Math.cos(t), 20 + 15 * Math.sin(t)]
  })
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    // 半分は逆向きに渡す
    if (i % 2) rasterTriangle(center, a, b, W, H, (x, y) => { count[y * W + x]++ })
    else rasterTriangle(center, b, a, W, H, (x, y) => { count[y * W + x]++ })
  }
  assert.ok(Math.max(...count) === 1)
  const filled = count.reduce((s, v) => s + v, 0)
  const area = 0.5 * 9 * 15 * 15 * Math.sin((2 * Math.PI) / 9)
  assert.ok(Math.abs(filled - area) < 0.08 * area)
})

test('塗る画素の重心座標は元の頂点の順で、その画素の中心を再現する', () => {
  const a = [2.2, 3.1]
  const b = [17.8, 6.4]
  const c = [6.5, 15.9]
  for (const order of [[a, b, c], [a, c, b]]) {
    rasterTriangle(order[0], order[1], order[2], 20, 20, (x, y, l0, l1, l2) => {
      close(l0 + l1 + l2, 1, 1e-9)
      close(l0 * order[0][0] + l1 * order[1][0] + l2 * order[2][0], x + 0.5, 1e-9)
      close(l0 * order[0][1] + l1 * order[1][1] + l2 * order[2][1], y + 0.5, 1e-9)
    })
  }
})
