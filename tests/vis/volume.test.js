// volume.js の性質(吸収と発光、合成、伝達関数、光線の追跡)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alphaFromSigma, castRay, compositeBackToFront, compositeFrontToBack, emissionAbsorption, headPhantom3D,
  headPhantomValue, opacityCorrection, rayBox, sampleVolume, sliceAxis, transferFunction, transmittance,
} from '../../src/utils/vis/volume.js'

const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)

test('σ が一定なら透過率は e^{−σL}、区間をつなぐと掛け算になる', () => {
  near(transmittance(new Array(10).fill(0.8), 0.25), Math.exp(-0.8 * 2.5))
  const a = transmittance([0.3, 1.2], 0.5)
  const b = transmittance([0.7, 0.1, 2.0], 0.5)
  near(transmittance([0.3, 1.2, 0.7, 0.1, 2.0], 0.5), a * b)
})

test('σ と L_e が一定なら、発光と吸収は L = L_e(1 − e^{−σs}) + L_0 e^{−σs}(区切り方によらない)', () => {
  for (const nSeg of [1, 7, 50]) {
    const s = 2
    const ds = s / nSeg
    const L = emissionAbsorption(new Array(nSeg).fill(0.9), new Array(nSeg).fill(0.6), ds, 0.3)
    near(L, 0.6 * (1 - Math.exp(-0.9 * s)) + 0.3 * Math.exp(-0.9 * s), 1e-12)
  }
})

test('前からと後ろからの合成は同じ色。打ち切りの誤差は 1 − stopAt 以下', () => {
  const colors = [[0.9, 0.2, 0.1], [0.1, 0.8, 0.3], [0.2, 0.3, 0.9], [0.6, 0.6, 0.6], [1, 1, 0]]
  const alphas = [0.3, 0.5, 0.2, 0.7, 0.4]
  const f = compositeFrontToBack(colors, alphas)
  const b = compositeBackToFront(colors, alphas)
  for (let c = 0; c < 3; c++) near(f.color[c], b.color[c], 1e-12)
  near(f.alpha, b.alpha, 1e-12)
  const stop = compositeFrontToBack(colors, alphas, { stopAt: 0.8 })
  assert.ok(stop.used < alphas.length)
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(stop.color[c] - f.color[c]) <= 1 - stop.alpha + 1e-12)
  near(alphaFromSigma(0, 1), 0)
  assert.ok(alphaFromSigma(5, 1) < 1)
})

test('不透明度の補正: 同じ間隔なら変わらず、半分の間隔で 2 回重ねると 1 回と同じ', () => {
  near(opacityCorrection(0.4, 0.1, 0.1), 0.4)
  const half = opacityCorrection(0.4, 0.05, 0.1)
  near(1 - (1 - half) ** 2, 0.4, 1e-12)
})

test('伝達関数は点で点の値、間は線形、外は端の値', () => {
  const tf = [{ value: 0.1, alpha: 0, t: 0 }, { value: 0.5, alpha: 0.8, t: 0.5 }, { value: 1, alpha: 0.2, t: 1 }]
  near(transferFunction(tf, 0.5).alpha, 0.8)
  near(transferFunction(tf, 0.3).alpha, 0.4)
  near(transferFunction(tf, 0.75).t, 0.75)
  near(transferFunction(tf, -1).alpha, 0)
  near(transferFunction(tf, 2).alpha, 0.2)
})

test('光線と箱: 当たる区間、外れると null、軸に平行な光線も', () => {
  const hit = rayBox([0, 0, 5], [0, 0, -1], [-1, -1, -1], [1, 1, 1])
  near(hit[0], 4)
  near(hit[1], 6)
  assert.equal(rayBox([3, 0, 5], [0, 0, -1], [-1, -1, -1], [1, 1, 1]), null)
  assert.equal(rayBox([0, 0, 5], [0, 0, 1], [-1, -1, -1], [1, 1, 1]), null) // 箱は後ろ
})

test('一様なボリュームを通る光線の合成は、透過率の式と一致する', () => {
  const n = 9
  const vol = new Float32Array(n * n * n).fill(0.5)
  const sigma = 1.2
  const ds = 0.02
  const r = castRay(vol, n, [0, 0, 5], [0, 0, -1], {
    mode: 'composite', ds, ds0: ds, stopAt: 1,
    tf: () => ({ alpha: alphaFromSigma(sigma, ds), t: 0 }),
    colorOf: () => [1, 1, 1],
  })
  // 長さ 2 の箱を Δs ごとに足す(サンプルは 2/Δs + 1 個)
  near(r.alpha, 1 - Math.exp(-sigma * ds * r.steps), 1e-9)
  near(r.alpha, 1 - Math.exp(-sigma * 2), 0.03)
})

test('ボリュームの値の補間は格子の点で格子の値、最大値投影は最大を返す', () => {
  const n = 5
  const vol = new Float32Array(n * n * n)
  vol[2 + n * (2 + n * 2)] = 1 // 真ん中に 1 点
  near(sampleVolume(vol, n, 0, 0, 0), 1)
  near(sampleVolume(vol, n, 0.25, 0, 0), 0.5) // 隣の格子点との真ん中
  const mip = castRay(vol, n, [0, 0, 5], [0, 0, -1], { mode: 'mip', ds: 0.05 })
  near(mip.value, 1, 1e-9)
})

test('等値面のモード: 球の値の場で、最初に越える所は球の表面', () => {
  const n = 33
  const vol = new Float32Array(n * n * n)
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -1 + (2 * i) / (n - 1)
    const y = -1 + (2 * j) / (n - 1)
    const z = -1 + (2 * k) / (n - 1)
    vol[i + n * (j + n * k)] = 1 - Math.hypot(x, y, z) // 中心で 1、外へ減る
  }
  const r = castRay(vol, n, [0, 0, 5], [0, 0, -1], { mode: 'iso', ds: 0.02, isoValue: 0.5, light: [0, 0, 1] })
  near(5 - r.t, 0.5, 0.01) // 半径 0.5 の球の手前の面(z = 0.5)
  assert.ok(r.color[0] > 0.9) // 正面を向いた面は明るい
})

test('板を並べる軸は、見る向きにいちばん近い軸', () => {
  assert.equal(sliceAxis([0.1, 0.2, -0.9]), 2)
  assert.equal(sliceAxis([-0.8, 0.5, 0.1]), 0)
  assert.equal(sliceAxis([0.3, 0.9, 0.3]), 1)
})

test('頭の模型: 外の殻は 1、中は 0.2、空洞は 0、外は 0', () => {
  near(headPhantomValue(0, 0.9, 0), 1) // 殻(上の縁の近く)
  near(headPhantomValue(0, 0.35, 0), 0.3) // 小さな塊(中 0.2 + 0.1)
  near(headPhantomValue(0.5, -0.5, 0), 0.2)
  near(headPhantomValue(0.95, 0.95, 0.95), 0)
  const vol = headPhantom3D(17)
  assert.equal(vol.length, 17 ** 3)
  assert.ok(Math.max(...vol) <= 1 + 1e-6 && Math.min(...vol) >= -1e-6)
})

test('最近傍は、格子点ではその値、格子の間ではいちばん近い格子点の値', async () => {
  const { sampleVolumeNearest } = await import('../../src/utils/vis/volume.js')
  const n = 3
  const vol = Float32Array.from({ length: 27 }, (_, i) => i)
  near(sampleVolumeNearest(vol, n, -1, -1, -1), 0)
  near(sampleVolumeNearest(vol, n, 0, 0, 0), 13)
  near(sampleVolumeNearest(vol, n, 0.4, 0, 0), 13) // x の格子点 0 と 1 の間で 0 に近い
  near(sampleVolumeNearest(vol, n, 0.6, 0, 0), 14)
})
