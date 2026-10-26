// fft.js・ct.js・imageFilter.js の性質(フーリエ変換、投影と再構成、画像の前処理)
// 実行: node --test "tests/vis/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dft, fft, fft2D } from '../../src/utils/vis/fft.js'
import {
  SHEPP_LOGAN, addNoise, backproject, detectorPosition, ellipseProjection, fbp, filterProjection, phantomValue,
  projectPhantom, rampKernel, rasterizePhantom, rmse, sampleSpectrumLine, seededRandom, sinogram, squareWavePartialSum,
} from '../../src/utils/vis/ct.js'
import {
  LAPLACIAN4, SE_CROSS, SE_SQUARE, boxBlur, close, dilate, edgePreservingSmooth, erode, median, median1D,
  movingAverage1D, open, sharpen,
} from '../../src/utils/vis/imageFilter.js'

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} の差が ${eps} より大きい`)

test('FFT は DFT と一致し、逆変換で元に戻る。パーセバルの等式', () => {
  const rand = seededRandom(7)
  const N = 64
  const re = Array.from({ length: N }, () => rand() - 0.5)
  const im = Array.from({ length: N }, () => rand() - 0.5)
  const ref = dft(re, im)
  const r = Float64Array.from(re)
  const i = Float64Array.from(im)
  fft(r, i)
  for (let k = 0; k < N; k++) {
    near(r[k], ref.re[k], 1e-10)
    near(i[k], ref.im[k], 1e-10)
  }
  const energyT = re.reduce((s, v, k) => s + v * v + im[k] * im[k], 0)
  const energyF = r.reduce((s, v, k) => s + v * v + i[k] * i[k], 0) / N
  near(energyT, energyF, 1e-10)
  fft(r, i, true)
  for (let k = 0; k < N; k++) {
    near(r[k], re[k], 1e-12)
    near(i[k], im[k], 1e-12)
  }
})

test('矩形波の部分和は t = π/2 で 1 に近づき、不連続の近くの行き過ぎは約 9%(ギブズ)', () => {
  near(squareWavePartialSum(Math.PI / 2, 401), 1, 0.01)
  let peak = 0
  for (let t = 0.0005; t < 0.1; t += 0.0005) peak = Math.max(peak, squareWavePartialSum(t, 401))
  near(peak, 1.179, 0.01) // 1 + 約 0.0895 × 2(跳びの大きさ 2 の約 9%)
})

test('楕円の投影の式は、点を細かく足した線積分と一致し、中心をずらすと s がずれる', () => {
  const e = [0.7, 0.5, 0.3, 0.2, -0.1, 30]
  for (const theta of [0, 0.7, 1.9]) {
    for (const s of [-0.3, 0, 0.25]) {
      // 光線 x cosθ + y sinθ = s の上を、細かい刻みで値を足す
      const c = Math.cos(theta)
      const sn = Math.sin(theta)
      let sum = 0
      const dt = 1e-4
      for (let t = -1.5; t < 1.5; t += dt) sum += phantomValue(s * c - t * sn, s * sn + t * c, [e]) * dt
      near(ellipseProjection(e, s, theta), sum, 2e-3)
    }
  }
  const shifted = [1, 0.4, 0.4, 0.3, 0, 0]
  near(ellipseProjection(shifted, 0.3, 0), 0.8, 1e-12) // 中心の線は直径 0.8
})

test('点のサイノグラムは、最大の位置が s = x cosθ + y sinθ を通る', () => {
  const dot = [[1, 0.02, 0.02, 0.4, 0.25, 0]]
  const nA = 36
  const nD = 128
  const sino = sinogram(dot, nA, nD)
  for (let k = 0; k < nA; k++) {
    let best = 0
    for (let m = 1; m < nD; m++) if (sino[k * nD + m] > sino[k * nD + best]) best = m
    const theta = (k * Math.PI) / nA
    near(detectorPosition(best, nD), 0.4 * Math.cos(theta) + 0.25 * Math.sin(theta), 2 / nD)
  }
})

test('Ram-Lak のカーネルの DFT は |w| に近い', () => {
  const L = 256
  const tau = 1
  const h = rampKernel(L, tau)
  const re = Float64Array.from(h)
  const im = new Float64Array(L)
  fft(re, im)
  for (const k of [8, 32, 64, 100]) {
    const w = k / (L * tau)
    near(re[k] * tau, w, 0.01 * (1 / (2 * tau)))
  }
})

test('一様な円板をフィルタ補正逆投影すると値が戻り、角度を増やすと誤差が減る。フィルタなしはぼける', () => {
  const disk = [[1, 0.5, 0.5, 0, 0, 0]]
  const n = 64
  const truth = rasterizePhantom(n, disk)
  const recon = (nA) => fbp(sinogram(disk, nA, 128), nA, 128, n)
  const img = recon(180)
  near(img[(n / 2) * n + n / 2], 1, 0.03)
  near(img[2 * n + 2], 0, 0.05)
  assert.ok(rmse(recon(12), truth) > rmse(recon(90), truth))
  const blurred = backproject(sinogram(disk, 90, 128), 90, 128, n)
  assert.ok(blurred[(n / 2) * n + n / 2] > blurred[2 * n + 2])
  assert.ok(blurred[2 * n + 2] > 0.1) // 円板の外まで、にじみが広がる(フィルタをかけると ≈ 0)
})

test('フィルタをかけた投影は両側に負の谷ができる(高い周波数を持ち上げる)', () => {
  const nD = 128
  const p = Float64Array.from({ length: nD }, (_, m) => ellipseProjection([1, 0.4, 0.4, 0, 0, 0], detectorPosition(m, nD), 0))
  const q = filterProjection(p, 2 / nD)
  const outside = Math.round(((0.5 + 1) / 2) * nD) // s = 0.5(円板の外)
  assert.ok(q[outside] < 0)
})

test('中央断面定理: 円板の投影の 1 次元 FFT の大きさは、断面の 2 次元 FFT のその向きの線の大きさと一致する', () => {
  const n = 128
  const tau = 2 / n
  // 左右にも上下にも対称でない楕円(向きで投影が変わる)。斜めの線は格子の間を補間するので、格子に乗る 0° と 90° で比べる
  const shape = [[1, 0.35, 0.2, 0.1, -0.05, 25]]
  const img = rasterizePhantom(n, shape)
  const re = Float64Array.from(img)
  const im = new Float64Array(n * n)
  fft2D(re, im, n)
  const dc = tau * tau * Math.hypot(re[0], im[0])
  for (const theta of [0, Math.PI / 2]) {
    const pr = Float64Array.from({ length: n }, (_, m) => projectPhantom(shape, detectorPosition(m, n), theta))
    const pi = new Float64Array(n)
    fft(pr, pi)
    const line = sampleSpectrumLine(re, im, n, theta, 12)
    // 断面は画素で塗った形、投影は式の線積分なので、画素の階段の分だけずれる
    for (let k = 0; k < 12; k++) {
      near(tau * Math.hypot(pr[k], pi[k]), tau * tau * line[k], 0.02 * dc)
    }
  }
})

test('雑音は種で決まり、大きさは最大値の level 倍くらい', () => {
  const sino = sinogram(SHEPP_LOGAN, 8, 32)
  const a = addNoise(sino, 0.05, 3)
  const b = addNoise(sino, 0.05, 3)
  assert.deepEqual(Array.from(a), Array.from(b))
  assert.ok(rmse(a, sino) > 0)
})

test('1 次元: メディアンは飛び離れた値を消して段差を保ち、移動平均は段差をなまらせる', () => {
  const sig = [0, 0, 0, 9, 0, 0, 5, 5, 5, 5]
  const m = median1D(sig, 3)
  assert.equal(m[3], 0)
  assert.equal(m[6], 5)
  assert.equal(m[5], 0)
  const a = movingAverage1D(sig, 3)
  assert.ok(a[5] > 0 && a[5] < 5)
})

test('平滑化と鮮鋭化: 一定の画像は変わらず、1 次関数の傾きのラプラシアンは内部で 0、孤立点はメディアンで消える', () => {
  const w = 8
  const h = 6
  const flat = new Float64Array(w * h).fill(3)
  assert.ok(boxBlur(flat, w, h, 3).every((v) => Math.abs(v - 3) < 1e-12))
  assert.ok(sharpen(flat, w, h, 1).every((v) => Math.abs(v - 3) < 1e-12))
  const ramp = Float64Array.from({ length: w * h }, (_, i) => 0.5 * (i % w) + 0.25 * Math.floor(i / w))
  const lap = sharpen(ramp, w, h, 1, LAPLACIAN4).map((v, i) => ramp[i] - v) // = ∇²f
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) near(lap[y * w + x], 0, 1e-12)
  const speck = new Float64Array(w * h)
  speck[2 * w + 3] = 10
  assert.ok(median(speck, w, h, 3).every((v) => v === 0))
})

test('エッジ保存平滑化は段差を保ち、平らな所の雑音を減らす', () => {
  const w = 12
  const h = 12
  const rand = seededRandom(5)
  const img = Float64Array.from({ length: w * h }, (_, i) => ((i % w) < 6 ? 0 : 1) + 0.05 * (rand() - 0.5))
  const out = edgePreservingSmooth(img, w, h)
  for (let y = 2; y < h - 2; y++) {
    assert.ok(out[y * w + 5] < 0.1) // 段差の左のすぐ横は左の値のまま
    assert.ok(out[y * w + 6] > 0.9)
  }
})

test('モルフォロジー: 開放は孤立点を消し、閉鎖は 1 点の穴を埋め、2 回かけても同じ。膨張と収縮の双対', () => {
  const w = 16
  const h = 16
  const mask = new Uint8Array(w * h)
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) mask[y * w + x] = 1
  mask[1 * w + 1] = 1 // 孤立点
  mask[7 * w + 7] = 0 // 1 点の穴
  const o = open(mask, w, h, SE_SQUARE)
  assert.equal(o[1 * w + 1], 0)
  const c = close(mask, w, h, SE_SQUARE)
  assert.equal(c[7 * w + 7], 1)
  assert.deepEqual(Array.from(open(o, w, h, SE_SQUARE)), Array.from(o))
  assert.deepEqual(Array.from(close(c, w, h, SE_SQUARE)), Array.from(c))
  // 双対 (X ⊖ B)ᶜ = Xᶜ ⊕ B(B は対称)。画像の端の影響のない内側で比べる
  const comp = Uint8Array.from(mask, (v) => 1 - v)
  const left = erode(mask, w, h, SE_CROSS).map((v) => 1 - v)
  const right = dilate(comp, w, h, SE_CROSS)
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) assert.equal(left[y * w + x], right[y * w + x])
})
