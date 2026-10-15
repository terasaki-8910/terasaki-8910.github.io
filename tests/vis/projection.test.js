import test from 'node:test'
import assert from 'node:assert/strict'
import {
  perspectiveProject,
  projectToImage,
  parallelProject,
  perspectiveMatrix,
  toNDC,
  insideClip,
  viewport,
} from '../../src/utils/vis/projection.js'
import { transformPoint } from '../../src/utils/vis/mat4.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0
const roundAll = (v, digits = 4) => v.map((x) => round(x, digits))

function assertClose(actual, expected, tol = 1e-12, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} ${actual} と ${expected} の差が ${tol} を超えた`,
  )
}

function assertCloseVec(actual, expected, tol = 1e-12) {
  assert.equal(actual.length, expected.length)
  actual.forEach((x, i) => assertClose(x, expected[i], tol, `[${i}]`))
}

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 長方形の行列どうしの積と、行列とベクトルの積(3×4 の行列を扱うため)
const matMul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)))
const matVec = (A, v) => A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0))

const FOVY = Math.PI / 3 // 60°
const ASPECT = 16 / 9
const NEAR = 0.1
const FAR = 100
const P = perspectiveMatrix(FOVY, ASPECT, NEAR, FAR)
const clipOf = (x, y, z) => transformPoint(P, [x, y, z, 1])

test('透視投影: f=1 で x=1 の点は、z=2 で 0.5、z=4 で 0.25 に写る(遠いほど小さい)', () => {
  assert.deepEqual(perspectiveProject([1, 1, 2], 1), [0.5, 0.5])
  assert.deepEqual(perspectiveProject([1, -1, 4], 1), [0.25, -0.25])
  // 像の大きさは f に比例し、z に反比例する
  assert.deepEqual(perspectiveProject([1, 3, 4], 2), [0.5, 1.5])
  const sizes = [1, 2, 4, 8, 16].map((z) => perspectiveProject([1, 0, z], 1)[0])
  sizes.slice(1).forEach((s, i) => assert.ok(s < sizes[i]))
})

test('透視投影: 相似な三角形の関係 y\'/f = y/z が成り立つ', () => {
  const rng = makeRng(10)
  for (let n = 0; n < 50; n++) {
    const [x, y, z, f] = [rng() * 4 - 2, rng() * 4 - 2, rng() * 9 + 1, rng() * 3 + 0.5]
    const [xp, yp] = perspectiveProject([x, y, z], f)
    assertClose(yp / f, y / z, 1e-14)
    assertClose(xp / f, x / z, 1e-14)
  }
})

test('透視投影は同次座標の 3×4 行列で書ける: h = z になり、h で割ると透視投影', () => {
  const rng = makeRng(11)
  for (let n = 0; n < 50; n++) {
    const [x, y, z, f] = [rng() * 4 - 2, rng() * 4 - 2, rng() * 9 + 1, rng() * 3 + 0.5]
    const Pf = [
      [f, 0, 0, 0],
      [0, f, 0, 0],
      [0, 0, 1, 0],
    ]
    const [hx, hy, h] = matVec(Pf, [x, y, z, 1])
    assert.equal(h, z)
    assertCloseVec([hx / h, hy / h], perspectiveProject([x, y, z], f), 1e-14)
  }
})

test('カメラの後ろ(z<0)の点は反対側に写り、z≈0 の点は大きく飛ぶ(先に割るとだめな理由)', () => {
  assert.deepEqual(perspectiveProject([1, 1, 2], 1), [0.5, 0.5])
  assert.deepEqual(perspectiveProject([1, 1, -2], 1), [-0.5, -0.5])
  assert.equal(round(perspectiveProject([1, 0, 0.001], 1)[0]), 1000)
})

test('画像の座標: 拡大 s と中心 (x0,y0) をまとめた 3×4 行列の積と、投影の式 x\' = s f x/z + x0 が一致', () => {
  const [f, s, x0, y0] = [2, 100, 960, 540]
  const K = [
    [s, 0, x0],
    [0, s, y0],
    [0, 0, 1],
  ]
  const Pf = [
    [f, 0, 0, 0],
    [0, f, 0, 0],
    [0, 0, 1, 0],
  ]
  assert.deepEqual(matMul(K, Pf), [
    [s * f, 0, x0, 0],
    [0, s * f, y0, 0],
    [0, 0, 1, 0],
  ])
  const rng = makeRng(12)
  for (let n = 0; n < 50; n++) {
    const p = [rng() * 4 - 2, rng() * 4 - 2, rng() * 9 + 1]
    const [hx, hy, h] = matVec(matMul(K, Pf), [...p, 1])
    assertCloseVec([hx / h, hy / h], projectToImage(p, f, s, x0, y0), 1e-9)
  }
  // 光軸上の点は画像の中心に写る
  assert.deepEqual(projectToImage([0, 0, 5], f, s, x0, y0), [960, 540])
  assert.deepEqual(projectToImage([0.5, 0.25, 4], 1, 100, 960, 540), [972.5, 546.25])
})

test('平行投影は z を捨てるだけ', () => {
  assert.deepEqual(parallelProject([3, -2, 7]), [3, -2])
  assert.deepEqual(parallelProject([3, -2, -700]), [3, -2])
})

test('焦点距離 f→∞ で透視投影は平行投影に近づく: 投影面の 2 奥の点で f=1,10,1000 のとき x\'=0.333, 0.833, 0.998', () => {
  const d = 2
  const xs = [1, 10, 1000].map((f) => perspectiveProject([1, 0, f + d], f)[0])
  assert.deepEqual(
    xs.map((x) => round(x, 3)),
    [0.333, 0.833, 0.998],
  )
  const far = perspectiveProject([1, 0.5, 1e12 + d], 1e12)
  assertCloseVec(far, parallelProject([1, 0.5, 0]), 1e-11)
})

test('gluPerspective の行列: 前方の面が NDC の z=-1、後方の面が +1、w\' = -z', () => {
  const near = toNDC(clipOf(0, 0, -NEAR))
  const far = toNDC(clipOf(0, 0, -FAR))
  assertClose(near[2], -1, 1e-12)
  assertClose(far[2], 1, 1e-12)
  assert.equal(clipOf(3, 4, -7)[3], 7)
  assertClose(clipOf(0, 0, -NEAR)[3], NEAR, 1e-15)
})

test('視錐台の8頂点が NDC の立方体の8頂点 (±1,±1,±1) に写る。near の半分の高さは 0.0577、far は 57.7', () => {
  const t = Math.tan(FOVY / 2)
  assert.equal(round(NEAR * t), 0.0577)
  assert.equal(round(FAR * t, 1), 57.7)
  assert.equal(round(ASPECT * NEAR * t), 0.1026)
  assert.equal(round(ASPECT * FAR * t, 1), 102.6)
  for (const [zd, zn] of [
    [NEAR, -1],
    [FAR, 1],
  ]) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const eye = [sx * ASPECT * zd * t, sy * zd * t, -zd]
        assertCloseVec(toNDC(clipOf(...eye)), [sx, sy, zn], 1e-12)
      }
    }
  }
})

test('OpenGL の行列は、z の符号を反転した素朴な透視投影(f = 1/tan(fovy/2))を x だけ aspect で割ったものと一致する', () => {
  const rng = makeRng(13)
  const fy = 1 / Math.tan(FOVY / 2)
  for (let n = 0; n < 100; n++) {
    const [x, y, z] = [rng() * 20 - 10, rng() * 20 - 10, -(rng() * 50 + 0.5)]
    const [px, py] = perspectiveProject([x, y, -z], fy)
    const ndc = toNDC(clipOf(x, y, z))
    assertClose(ndc[0], px / ASPECT, 1e-12)
    assertClose(ndc[1], py, 1e-12)
  }
})

test('NDC の深度は z_ndc = -(f+n)/(n-f) - 2fn/((n-f) z) で、1/z についての1次式', () => {
  const rng = makeRng(14)
  const A = -(FAR + NEAR) / (NEAR - FAR)
  const B = -(2 * FAR * NEAR) / (NEAR - FAR)
  for (let n = 0; n < 100; n++) {
    const z = -(rng() * (FAR - NEAR) + NEAR)
    assertClose(toNDC(clipOf(0, 0, z))[2], A + B / z, 1e-12)
  }
  // 1/z を横軸に見ると直線: 等間隔の 1/z に対して等間隔に増える
  const zs = [4, 3, 2, 1].map((k) => -1 / (0.5 * k))
  const ds = zs.map((z) => toNDC(clipOf(0, 0, z))[2])
  assertClose(ds[1] - ds[0], ds[2] - ds[1], 1e-12)
  assertClose(ds[2] - ds[1], ds[3] - ds[2], 1e-12)
})

test('手前ほど深度が細かい: near から 2·near までの区間だけで NDC の深度の約半分を使う', () => {
  const z2 = toNDC(clipOf(0, 0, -2 * NEAR))[2]
  assert.equal(round(z2, 3), 0.001) // n/(f-n) = 0.001001: 範囲 [-1,1] のちょうど真ん中あたり
  assert.ok((z2 + 1) / 2 > 0.5)
})

test('insideClip: ビューボリュームの中は true、6つの面のどの外側も false', () => {
  assert.equal(insideClip(clipOf(0, 0, -5)), true)
  assert.equal(insideClip(clipOf(1, 1, -5)), true)
  const t = Math.tan(FOVY / 2)
  const z = -5
  assert.equal(insideClip(clipOf(ASPECT * -z * t * 1.01, 0, z)), false) // 右
  assert.equal(insideClip(clipOf(-ASPECT * -z * t * 1.01, 0, z)), false) // 左
  assert.equal(insideClip(clipOf(0, -z * t * 1.01, z)), false) // 上
  assert.equal(insideClip(clipOf(0, z * t * 1.01, z)), false) // 下
  assert.equal(insideClip(clipOf(0, 0, -NEAR * 0.99)), false) // 手前(near の内側)
  assert.equal(insideClip(clipOf(0, 0, -NEAR * 1.01)), true)
  assert.equal(insideClip(clipOf(0, 0, -FAR * 1.01)), false) // 奥
  assert.equal(insideClip(clipOf(0, 0, -FAR * 0.99)), true)
})

test('カメラの後ろの点は w<0 で insideClip が false。先に w で割ると、後ろの点も範囲の中に見えてしまう', () => {
  const behind = clipOf(0.1, 0.1, 5)
  assert.ok(behind[3] < 0)
  assert.equal(insideClip(behind), false)
  const [nx, ny] = toNDC(behind)
  assert.ok(Math.abs(nx) <= 1 && Math.abs(ny) <= 1) // 先に割ってから x, y だけ見ると素通りしてしまう
})

test('insideClip は、w>0 の点では「NDC の3成分がすべて -1〜1」と同じで、w<0 の点は常に false(乱数 3000 点)', () => {
  const rng = makeRng(15)
  let inside = 0
  let behind = 0
  for (let n = 0; n < 3000; n++) {
    const clip = clipOf(rng() * 120 - 60, rng() * 120 - 60, rng() * 170 - 150)
    if (clip[3] > 0) {
      const ok = toNDC(clip).every((c) => Math.abs(c) <= 1)
      assert.equal(insideClip(clip), ok)
      if (ok) inside++
    } else {
      assert.equal(insideClip(clip), false)
      behind++
    }
  }
  assert.ok(inside > 100 && behind > 100, `inside=${inside} behind=${behind}`)
})

test('ビューポート変換: 1920×1080 で NDC (0.5,0.5) は (1440,810)、1280×720 で (960,540)', () => {
  assert.deepEqual(viewport([0.5, 0.5], 0, 0, 1920, 1080), [1440, 810])
  assert.deepEqual(viewport([0.5, 0.5], 0, 0, 1280, 720), [960, 540])
  assert.deepEqual(viewport([0, 0], 0, 0, 1920, 1080), [960, 540])
})

test('ビューポート変換: (-1,-1) → (x0,y0)、(1,1) → (x0+w, y0+h)、原点のずれも足される', () => {
  assert.deepEqual(viewport([-1, -1], 10, 20, 640, 480), [10, 20])
  assert.deepEqual(viewport([1, 1], 10, 20, 640, 480), [650, 500])
  assert.deepEqual(viewport([0, 0], 10, 20, 640, 480), [330, 260])
  assert.deepEqual(viewport([-1, -1], 0, 0, 1920, 1080), [0, 0])
  assert.deepEqual(viewport([1, 1], 0, 0, 1920, 1080), [1920, 1080])
})

test('パイプライン全体: 視野の中心の点は画面の中心に、視野の右上の端は右上の角に写る', () => {
  const t = Math.tan(FOVY / 2)
  const z = -5
  const toPixel = (x, y) => viewport(toNDC(clipOf(x, y, z)), 0, 0, 1920, 1080)
  assertCloseVec(toPixel(0, 0), [960, 540], 1e-9)
  assertCloseVec(toPixel(ASPECT * -z * t, -z * t), [1920, 1080], 1e-9)
  assertCloseVec(roundAll(toPixel(0, 0), 3), [960, 540], 0)
})
