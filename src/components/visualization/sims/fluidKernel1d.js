// 段階 1(重み関数)の計算。1 次元に並べた粒子の値を、核 W で重みをつけて足し合わせて、なめらかな曲線にする。
// 核の形は utils/vis/sph.js の cubicSpline・poly6・spiky をそのまま使う(式を書き直さない)。それらは 2 次元で
// ∫W dA = 1 になる係数が付いているので、1 次元の図では、形はそのままで係数だけ ∫W dx = 1 になるように数値で求め直す
// (3 次スプラインの 1 次元の係数は解析的には 2/(3s)、s = h/2 なので 4/(3h)。テストでこれと一致することを確かめる)。
// 粒子の質量は全部 m(ここでは 1)で、粒子 j が占める長さは V_j = m/ρ_j、ρ_j = Σ_k m W(x_j − x_k)(自分も含む)。

import { cubicSpline, poly6, spiky } from '../../../utils/vis/sph.js'

export const KERNELS = [
  { id: 'spline', label: '3 次スプライン', shape: (r, h) => cubicSpline(r, h) },
  { id: 'poly6', label: 'poly6', shape: (r, h) => poly6(r * r, h) },
  { id: 'spiky', label: 'spiky', shape: (r, h) => spiky(r, h) },
]
const BY_ID = Object.fromEntries(KERNELS.map((k) => [k.id, k]))

export const X_RANGE = [0, 1] // 世界の範囲 [m]
export const MASS = 1 // 粒子 1 個の質量 [kg](1 次元の図なので、密度は kg/m)

// ∫_{−h}^{h} shape(|x|, h) dx の逆数(= 1 次元の係数)。シンプソン則(区間 400)。kind と h ごとに覚えておく
const normCache = new Map()
export function normalization1d(kind, h) {
  const key = `${kind}:${h}`
  const hit = normCache.get(key)
  if (hit !== undefined) return hit
  const shape = BY_ID[kind].shape
  const n = 400
  const d = h / n
  let sum = shape(0, h) + shape(h, h)
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * shape(i * d, h)
  const integral = 2 * ((sum * d) / 3) // 左右対称なので 0〜h を 2 倍
  if (normCache.size > 400) normCache.clear()
  normCache.set(key, 1 / integral)
  return 1 / integral
}

// 1 次元の核 W(r, h)(∫W dx = 1、r ≥ h で 0)
export function weight1d(kind, r, h) {
  return BY_ID[kind].shape(Math.abs(r), h) * normalization1d(kind, h)
}

// 粒子 j の密度 ρ_j = Σ_k m W(x_j − x_k)(自分を含む)
export function densities1d(xs, kind, h, m = MASS) {
  return xs.map((xj) => {
    let rho = 0
    for (const xk of xs) rho += m * weight1d(kind, xj - xk, h)
    return rho
  })
}

// 粒子が占める長さ V_j = m/ρ_j
export function volumes1d(xs, kind, h, m = MASS) {
  return densities1d(xs, kind, h, m).map((rho) => m / rho)
}

// 点 x の値 A(x) = Σ_j V_j A_j W(x − x_j)
export function interpolate1d(x, xs, vals, vols, kind, h) {
  let sum = 0
  for (let j = 0; j < xs.length; j++) sum += vols[j] * vals[j] * weight1d(kind, x - xs[j], h)
  return sum
}

// 重みの和 Σ_j V_j W(x − x_j)(粒子が一様に並んでいれば 1 に近い。端や、まばらな所では 1 より小さい)
export function weightSum1d(x, xs, vols, kind, h) {
  let sum = 0
  for (let j = 0; j < xs.length; j++) sum += vols[j] * weight1d(kind, x - xs[j], h)
  return sum
}

// 点 x から h より近い粒子の数
export function countWithin1d(x, xs, h) {
  let n = 0
  for (const xj of xs) if (Math.abs(x - xj) < h) n++
  return n
}

// 曲線 A(x) の点列(x が [x0, x1] を samples 個)
export function curve1d(xs, vals, vols, kind, h, samples = 160, range = X_RANGE) {
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const x = range[0] + ((range[1] - range[0]) * i) / samples
    pts.push([x, interpolate1d(x, xs, vals, vols, kind, h)])
  }
  return pts
}

// 核の曲線 W(x − center)の点列
export function kernelCurve1d(center, kind, h, samples = 160, range = X_RANGE) {
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const x = range[0] + ((range[1] - range[0]) * i) / samples
    pts.push([x, weight1d(kind, x - center, h)])
  }
  return pts
}

// 粒子を n 個、範囲の両端から 0.05 m 内側のあいだに等間隔に並べる
export function evenPositions(n, range = X_RANGE, margin = 0.05) {
  const lo = range[0] + margin
  const hi = range[1] - margin
  return Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1)))
}

// 値の並び。step は x = 0.5 で段差、wave は波、random は(種を固定した)ばらばら。値は 0.1〜0.9 あたり
export const PRESETS = [
  { id: 'step', label: '段差' },
  { id: 'wave', label: '波' },
  { id: 'random', label: 'ばらばら' },
]

export function presetValues(preset, xs) {
  if (preset === 'step') return xs.map((x) => (x < 0.5 ? 0.25 : 0.8))
  if (preset === 'wave') return xs.map((x) => 0.5 + 0.32 * Math.sin(2 * Math.PI * 1.5 * x))
  let s = 12345
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
  return xs.map(() => 0.15 + 0.7 * rand())
}

// 粒子 i を (x, value) へ動かす。ほかの粒子の位置は越えない(並びの順序を保つ)。範囲の外には出さない
export function moveParticle1d(xs, vals, i, x, value, range = X_RANGE, vRange = [0, 1.1]) {
  const gap = 0.004
  const lo = i > 0 ? xs[i - 1] + gap : range[0]
  const hi = i < xs.length - 1 ? xs[i + 1] - gap : range[1]
  xs[i] = Math.min(hi, Math.max(lo, x))
  vals[i] = Math.min(vRange[1], Math.max(vRange[0], value))
}
