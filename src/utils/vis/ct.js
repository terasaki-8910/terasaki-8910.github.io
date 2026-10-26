// CT(コンピュータ断層撮影)の投影と再構成(DOM に触れない純関数)。平行ビーム、断面は [−1, 1]² の正方形。
// 画像は n × n の配列で、行 0 が上(y = +1 の側)。画素 (i, j) の中心は x = −1 + (i + 0.5)τ、y = 1 − (j + 0.5)τ(τ = 2/n)。
// 投影は角度 θ_k = kπ/nAngles、検出器の位置 s_m = −1 + (m + 0.5)·(2/nDet)。サイノグラムは nAngles 行 × nDet 列。
// 出典: Radon (1917) / Shepp and Logan, IEEE Trans. Nuclear Science 21(3) (1974) /
// Ramachandran and Lakshminarayanan, PNAS 68(9) (1971) / Kak and Slaney, Principles of Computerized Tomographic
// Imaging (1988) / Toft, The Radon Transform: Theory and Implementation (1996)(改良版の模型の値)
import { fft, nextPow2 } from './fft.js'

// Shepp-Logan の頭の模型(Toft の改良版。濃淡の差を見やすくした値)。[A, a, b, x0, y0, φ(度)]:
// 値 A、x 方向の半径 a、y 方向の半径 b、中心 (x0, y0)、回転 φ
export const SHEPP_LOGAN = [
  [1, 0.69, 0.92, 0, 0, 0],
  [-0.8, 0.6624, 0.874, 0, -0.0184, 0],
  [-0.2, 0.11, 0.31, 0.22, 0, -18],
  [-0.2, 0.16, 0.41, -0.22, 0, 18],
  [0.1, 0.21, 0.25, 0, 0.35, 0],
  [0.1, 0.046, 0.046, 0, 0.1, 0],
  [0.1, 0.046, 0.046, 0, -0.1, 0],
  [0.1, 0.046, 0.023, -0.08, -0.605, 0],
  [0.1, 0.023, 0.023, 0, -0.606, 0],
  [0.1, 0.023, 0.046, 0.06, -0.605, 0],
]

// 点 (x, y) の値(点を含む楕円の値の和)
export function phantomValue(x, y, ellipses = SHEPP_LOGAN) {
  let v = 0
  for (const [A, a, b, x0, y0, deg] of ellipses) {
    const t = (deg * Math.PI) / 180
    const dx = x - x0
    const dy = y - y0
    const u = dx * Math.cos(t) + dy * Math.sin(t)
    const w = -dx * Math.sin(t) + dy * Math.cos(t)
    if ((u * u) / (a * a) + (w * w) / (b * b) <= 1) v += A
  }
  return v
}

export function rasterizePhantom(n, ellipses = SHEPP_LOGAN) {
  const img = new Float64Array(n * n)
  const tau = 2 / n
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) img[j * n + i] = phantomValue(-1 + (i + 0.5) * tau, 1 - (j + 0.5) * tau, ellipses)
  }
  return img
}

// @snippet ct-ellipseProjection
// 楕円 1 つの投影(光線 x cosθ + y sinθ = s に沿った値の線積分)。中心が原点で軸が座標軸に沿う楕円なら
// p(s) = 2Aab√(a²(θ) − s²)/a²(θ)(|s| ≤ a(θ))、a²(θ) = a² cos²θ + b² sin²θ。
// 回転 φ は θ − φ に、中心のずれは s − (x0 cosθ + y0 sinθ) に直して同じ式を使う
export function ellipseProjection(e, s, theta) {
  const [A, a, b, x0, y0, deg] = e
  const th = theta - (deg * Math.PI) / 180
  const sp = s - (x0 * Math.cos(theta) + y0 * Math.sin(theta))
  const a2 = a * a * Math.cos(th) ** 2 + b * b * Math.sin(th) ** 2
  if (sp * sp > a2) return 0
  return (2 * A * a * b * Math.sqrt(a2 - sp * sp)) / a2
}
// @end

// @snippet ct-projectPhantom
// 模型の投影 p_θ(s) は、楕円ごとの投影の和(積分は足し算に分けられる)
export function projectPhantom(ellipses, s, theta) {
  let p = 0
  for (const e of ellipses) p += ellipseProjection(e, s, theta)
  return p
}
// @end

export const detectorPosition = (m, nDet) => -1 + ((m + 0.5) * 2) / nDet
export const angleOf = (k, nAngles) => (k * Math.PI) / nAngles

// @snippet ct-sinogram
// サイノグラム: 角度ごとの投影を 1 行ずつ積んだ画像(nAngles 行 × nDet 列)
export function sinogram(ellipses, nAngles, nDet) {
  const sino = new Float64Array(nAngles * nDet)
  for (let k = 0; k < nAngles; k++) {
    const theta = angleOf(k, nAngles)
    for (let m = 0; m < nDet; m++) sino[k * nDet + m] = projectPhantom(ellipses, detectorPosition(m, nDet), theta)
  }
  return sino
}
// @end

// @snippet ct-squareWavePartialSum
// 矩形波(周期 2π、値 ±1)のフーリエ級数を K 次まで足したもの: (4/π) Σ_{k = 1, 3, 5, …, K} sin(kt)/k
export function squareWavePartialSum(t, K) {
  let s = 0
  for (let k = 1; k <= K; k += 2) s += Math.sin(k * t) / k
  return (4 / Math.PI) * s
}
// @end

// @snippet ct-rampKernel
// ランプフィルタ |w| の、間隔 τ の離散のたたみ込みの係数(Ram-Lak):
// h(0) = 1/(4τ²)、n が偶数なら 0、奇数なら −1/(n²π²τ²)。長さ L(2 のべき)の配列に、負の番号を後ろから折り返して入れる
export function rampKernel(L, tau) {
  const h = new Float64Array(L)
  h[0] = 1 / (4 * tau * tau)
  for (let k = 1; k <= L / 2; k++) {
    const v = k % 2 === 0 ? 0 : -1 / (k * k * Math.PI * Math.PI * tau * tau)
    h[k] = v
    h[L - k] = v
  }
  return h
}
// @end

// 周波数の窓(ω は 0〜1 に直した周波数 |w|/w_max)
export function frequencyWindow(name, omega) {
  if (name === 'shepp-logan') return omega === 0 ? 1 : Math.sin((Math.PI * omega) / 2) / ((Math.PI * omega) / 2)
  if (name === 'hann') return 0.5 * (1 + Math.cos(Math.PI * omega))
  return 1
}

// @snippet ct-filterProjection
// 投影 1 本にランプフィルタをかける: Q(s) = ∫ P(w) |w| e^{i2πws} dw を、間隔 τ のたたみ込み τ Σ h(s − s_k) p(s_k) で。
// たたみ込みは FFT で(長さを 2 倍以上の 2 のべきにして 0 を詰め、端の回り込みを防ぐ)。window で高い周波数を弱める
export function filterProjection(p, tau, window = 'ram-lak') {
  const n = p.length
  const L = nextPow2(2 * n)
  const pr = new Float64Array(L)
  const pi = new Float64Array(L)
  pr.set(p)
  const hr = rampKernel(L, tau)
  const hi = new Float64Array(L)
  fft(pr, pi)
  fft(hr, hi)
  for (let k = 0; k < L; k++) {
    const kk = k <= L / 2 ? k : L - k
    const w = frequencyWindow(window, (2 * kk) / L)
    const re = pr[k] * hr[k] - pi[k] * hi[k]
    const im = pr[k] * hi[k] + pi[k] * hr[k]
    pr[k] = re * w * tau
    pi[k] = im * w * tau
  }
  fft(pr, pi, true)
  return pr.slice(0, n)
}
// @end

// @snippet ct-backproject
// 逆投影: 画素 (x, y) に、角度ごとの投影の s = x cosθ + y sinθ の値を足していく(検出器の間は線形補間)。
// (π/nAngles) Σ_k Q_k(x cosθ_k + y sinθ_k)。upTo で最初の何本までを足すか(再生で 1 本ずつ足すため)
export function backproject(sino, nAngles, nDet, n, { upTo = nAngles } = {}) {
  const img = new Float64Array(n * n)
  const tau = 2 / n
  const dtau = 2 / nDet
  for (let k = 0; k < upTo; k++) {
    const theta = angleOf(k, nAngles)
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const row = k * nDet
    for (let j = 0; j < n; j++) {
      const y = 1 - (j + 0.5) * tau
      for (let i = 0; i < n; i++) {
        const x = -1 + (i + 0.5) * tau
        const pos = (x * c + y * s + 1) / dtau - 0.5
        const m = Math.floor(pos)
        if (m < -1 || m >= nDet) continue
        const f = pos - m
        const a = m >= 0 ? sino[row + m] : 0
        const b = m + 1 < nDet ? sino[row + m + 1] : 0
        img[j * n + i] += a * (1 - f) + b * f
      }
    }
  }
  const scale = Math.PI / nAngles
  for (let i = 0; i < img.length; i++) img[i] *= scale
  return img
}
// @end

// @snippet ct-fbp
// フィルタ補正逆投影: 投影ごとにランプフィルタをかけてから逆投影する
export function fbp(sino, nAngles, nDet, n, window = 'ram-lak', opts = {}) {
  const filtered = new Float64Array(sino.length)
  const dtau = 2 / nDet
  for (let k = 0; k < nAngles; k++) {
    const row = sino.subarray(k * nDet, (k + 1) * nDet)
    filtered.set(filterProjection(row, dtau, window), k * nDet)
  }
  return backproject(filtered, nAngles, nDet, n, opts)
}
// @end

// 種つきの乱数(mulberry32)。同じ種なら同じ列
export function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// サイノグラムに正規分布の雑音を足す(大きさは最大値の level 倍)
export function addNoise(sino, level, seed = 1) {
  const rand = seededRandom(seed)
  let max = 0
  for (const v of sino) max = Math.max(max, Math.abs(v))
  const out = new Float64Array(sino.length)
  for (let i = 0; i < sino.length; i++) {
    const u1 = Math.max(rand(), 1e-12)
    const u2 = rand()
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    out[i] = sino[i] + level * max * g
  }
  return out
}

export function rmse(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s / a.length)
}

// @snippet ct-sampleSpectrumLine
// 中央断面定理の確かめ: 画像の 2 次元 DFT(re, im)の、原点を通る角度 θ の線の上の大きさを、周波数の番号 k = 0..count−1
// で取る(番号の間は双線形補間)。画像の行は上から下へ y が減るので、y の周波数は符号を逆にして読む
export function sampleSpectrumLine(re, im, n, theta, count) {
  const mag = (kx, ky) => {
    const i = ((kx % n) + n) % n
    const j = ((ky % n) + n) % n
    return Math.hypot(re[j * n + i], im[j * n + i])
  }
  const out = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    const u = k * Math.cos(theta)
    const v = -k * Math.sin(theta)
    const i0 = Math.floor(u)
    const j0 = Math.floor(v)
    const a = u - i0
    const b = v - j0
    out[k] = (1 - a) * (1 - b) * mag(i0, j0) + a * (1 - b) * mag(i0 + 1, j0) + (1 - a) * b * mag(i0, j0 + 1) + a * b * mag(i0 + 1, j0 + 1)
  }
  return out
}
// @end
