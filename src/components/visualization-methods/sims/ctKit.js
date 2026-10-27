// CT のタブの全体と段階 1〜5 に共通の部品。描く関数のほかは DOM に触れない(import しただけでは何もしない)。
// 計算は src/utils/vis/ct.js・fft.js・imageFilter.js のものをそのまま呼ぶ。ここは、その呼び出しの順番(前処理 → フィルタ →
// 逆投影 → 後処理)と、灰色の画像・平行ビームの絵・軸の描き方だけを持つ。
import { useEffect, useState } from 'react'
import { addNoise, backproject, filterProjection, rasterizePhantom, rmse, sinogram, squareWavePartialSum } from '../../../utils/vis/ct.js'
import { SE_SQUARE, median1D, movingAverage1D, open, sharpen, threshold } from '../../../utils/vis/imageFilter.js'
import { monoFont, uiFont } from '../../visualization/canvasFont.js'
import { blitPixels } from './pixelKit.js'

export const VALUE_MAX = 0.6 // 灰色の画像の上限(これ以上は白)。小さな楕円(0.3)と脳の中(0.2)の差が見えるように
export const BEAM_MARGIN = 1.3 // 模型の枠の半分の幅 ÷ 画像の半分の幅(線源と検出器を描く余白)
export const NOISE_SEED = 7
export const POST_THRESHOLD = 0.1 // 「二値化して開放」の閾値(脳の中の値 0.2 の半分)
export const DRAGGABLE = [4, 5, 6, 7, 8, 9] // つかめる楕円(SHEPP_LOGAN の 5〜10 番)
export const ANGLE_RATE = Math.PI / 6 // 再生で θ が進む速さ(30°/s)

export const FILTER_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'ram-lak', label: 'ランプ' },
  { value: 'shepp-logan', label: 'シェップ-ローガン' },
  { value: 'hann', label: 'ハン' },
]
// 絵の上のタブに置くときの名前(「なし」だけでは何のなしか分からないので)
export const FILTER_TAB_OPTIONS = FILTER_OPTIONS.map((o) => (o.value === 'none' ? { ...o, label: 'フィルタなし' } : o))
export const PRE_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'mean', label: '移動平均' },
  { value: 'median', label: 'メディアン' },
]
export const POST_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'sharpen', label: '鮮鋭化' },
  { value: 'open', label: '二値化して開放' },
]

export const deg = (rad) => (rad * 180) / Math.PI
export const rad = (degrees) => (degrees * Math.PI) / 180
export const clampNumber = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ---- 計算の呼び出し(DOM なし) ----------------------------------------------------------------

const ellipsesKey = (ellipses) => ellipses.map((e) => e.join(',')).join(';')

// 模型の画素(n × n)。直前の数個を覚えておく(ドラッグ中に何度も同じ絵を作り直さない)
const rasterCache = new Map()
export function phantomValues(ellipses, n = 128) {
  const key = `${n}|${ellipsesKey(ellipses)}`
  let values = rasterCache.get(key)
  if (!values) {
    values = rasterizePhantom(n, ellipses)
    rasterCache.set(key, values)
    if (rasterCache.size > 6) rasterCache.delete(rasterCache.keys().next().value)
  }
  return values
}

// サイノグラムの各行(s 方向)に、幅 3 の移動平均かメディアンをかける
export function preprocessRows(sino, nAngles, nDet, mode) {
  if (mode === 'none') return sino
  const out = new Float64Array(sino.length)
  for (let k = 0; k < nAngles; k++) {
    const row = sino.subarray(k * nDet, (k + 1) * nDet)
    out.set(mode === 'median' ? median1D(row, 3) : movingAverage1D(row, 3), k * nDet)
  }
  return out
}

// 投影ごとにランプフィルタ(窓つき)をかける。ct.js の fbp が中でしているのと同じ、行ごとの filterProjection
export function filterRows(sino, nAngles, nDet, window) {
  const out = new Float64Array(sino.length)
  for (let k = 0; k < nAngles; k++) out.set(filterProjection(sino.subarray(k * nDet, (k + 1) * nDet), 2 / nDet, window), k * nDet)
  return out
}

// 再構成した断面への後処理: 鮮鋭化、または二値化してから開放
export function postprocess(img, n, mode) {
  if (mode === 'sharpen') return sharpen(img, n, n, 1)
  if (mode === 'open') return Float64Array.from(open(threshold(img, POST_THRESHOLD), n, n, SE_SQUARE))
  return img
}

// 楕円ごとの投影の和(投影は足し算に分けられる)。1 つだけ動かすときは、その楕円の分だけ作り直す。sinogram(ellipses, …) と同じ値
function createSinogramSum() {
  const parts = new Map()
  return (ellipses, nAngles, nDet) => {
    const sum = new Float64Array(nAngles * nDet)
    const used = new Set()
    for (const e of ellipses) {
      const key = `${e.join(',')}|${nAngles}|${nDet}`
      used.add(key)
      let part = parts.get(key)
      if (!part) {
        part = sinogram([e], nAngles, nDet)
        parts.set(key, part)
      }
      for (let i = 0; i < sum.length; i++) sum[i] += part[i]
    }
    for (const key of parts.keys()) if (!used.has(key)) parts.delete(key)
    return sum
  }
}

// 撮る → 前処理 → フィルタ → 逆投影 → 後処理 の順に計算し、手前までの結果を覚えておく(途中の段が同じなら作り直さない)。
//   run({ ellipses, nAngles, nDet, noise, pre, filter, post, upTo, n })
//   → { raw, measured, filtered, truth, recon, rmse, range }(range は再構成を灰色にするときの [最小, 最大])
//   upTo: 最初の何本の投影まで足すか(再生で 1 本ずつ足す)。足した本数が違っても明るさがそろうよう、nAngles / upTo を掛ける。
//   フィルタなし(単なる逆投影)は値が模型の何倍にもなるので、画素の合計を模型にそろえてから見せる
export function createPipeline() {
  const slots = {}
  const sinogramSum = createSinogramSum()
  const cached = (name, key, make) => {
    const slot = slots[name]
    if (slot && slot.key === key) return slot.value
    const value = make()
    slots[name] = { key, value }
    return value
  }
  return function run({ ellipses, nAngles, nDet, noise = 0, pre = 'none', filter = 'ram-lak', post = 'none', upTo = nAngles, n = 128 }) {
    const e = ellipsesKey(ellipses)
    const kRaw = `${e}|${nAngles}|${nDet}`
    const raw = cached('raw', kRaw, () => sinogramSum(ellipses, nAngles, nDet))
    const kNoise = `${kRaw}|${noise}`
    const noisy = cached('noisy', kNoise, () => (noise > 0 ? addNoise(raw, noise, NOISE_SEED) : raw))
    const kPre = `${kNoise}|${pre}`
    const measured = cached('pre', kPre, () => preprocessRows(noisy, nAngles, nDet, pre))
    const kFilter = `${kPre}|${filter}`
    const filtered = cached('filter', kFilter, () => (filter === 'none' ? measured : filterRows(measured, nAngles, nDet, filter)))
    const truth = phantomValues(ellipses, n)
    const kRecon = `${kFilter}|${upTo}|${n}|${e}`
    const recon = cached('recon', kRecon, () => {
      const sum = backproject(filtered, nAngles, nDet, n, { upTo })
      let scale = nAngles / upTo
      if (filter === 'none') {
        let sumTruth = 0
        let sumRecon = 0
        for (let i = 0; i < sum.length; i++) {
          sumTruth += truth[i]
          sumRecon += sum[i]
        }
        scale = sumRecon > 0 ? sumTruth / sumRecon : 1
      }
      for (let i = 0; i < sum.length; i++) sum[i] *= scale
      return sum
    })
    const display = cached('post', `${kRecon}|${post}`, () => postprocess(recon, n, post))
    // 二値化して開放した画像は、模型も同じ閾値で二値化したものと比べる(値の大きさそのものは比べられない)
    const error = cached('rmse', `${kRecon}|${post}`, () => rmse(display, post === 'open' ? Float64Array.from(threshold(truth, POST_THRESHOLD)) : truth))
    // 灰色の窓。フィルタなしの逆投影は値に意味のある大きさがない(ぼけた像の濃淡だけ)ので、最小〜最大に伸ばして見せる
    const range = cached('range', `${kRecon}|${post}`, () => {
      if (filter !== 'none' || post === 'open') return [0, VALUE_MAX]
      let lo = Infinity
      let hi = -Infinity
      for (const v of display) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      return hi - lo > 1e-9 ? [lo, hi] : [lo, lo + 1]
    })
    return { raw, measured, filtered, truth, recon: display, rmse: error, range }
  }
}

// 矩形波の k 番目の成分(奇数 k)。部分和の差 S_k − S_{k−2} が sin(kt) の 4/(πk) 倍になることを、そのまま使う
export const squareWaveComponent = (t, k) => squareWavePartialSum(t, k) - squareWavePartialSum(t, k - 2)
// 成分 k の振れ幅(山の高さ。sin(kt) が 1 になる t = π/(2k) での値)
export const squareWaveAmplitude = (k) => squareWaveComponent(Math.PI / (2 * k), k)

// ---- 灰色の画像 -------------------------------------------------------------------------------

// 値の灰色: ink と surface のうち暗い方を低い値、明るい方を高い値にする(ライトでもダークでも高い値が明るい灰色。
// paper はライトのテーマで黄色なので混ぜない)。テーマが変わると colors が作り直されるので、colors ごとに覚える
const lutCache = new WeakMap()
export function grayLut(colors) {
  let lut = lutCache.get(colors)
  if (!lut) {
    lut = new Uint8ClampedArray(256 * 3)
    const dark = colors.dark ? colors.rgb.surface : colors.rgb.ink
    const light = colors.dark ? colors.rgb.ink : colors.rgb.surface
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(dark[c] + ((light[c] - dark[c]) * i) / 255)
    lutCache.set(colors, lut)
  }
  return lut
}
export const grayEnds = (colors) => ({
  dark: colors.dark ? colors.rgb.surface : colors.rgb.ink,
  light: colors.dark ? colors.rgb.ink : colors.rgb.surface,
})

// 凡例の色見本(低い値 → 高い値)。ダークでは ink と surface の向きが逆になる
export function useIsDark() {
  const read = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}
export const grayRampSwatch = (dark) => (dark
  ? 'linear-gradient(90deg, var(--color-surface), var(--color-ink))'
  : 'linear-gradient(90deg, var(--color-ink), var(--color-surface))')

let sharedPixels = new Uint8ClampedArray(0)
function takePixels(count) {
  if (sharedPixels.length < count * 4) sharedPixels = new Uint8ClampedArray(count * 4)
  return sharedPixels.subarray(0, count * 4)
}

// 値(w × h、行 0 が上)を灰色で rect に描く。rows: 上から何行まで描くか(サイノグラムが埋まる途中)。
// crispRows: 行を 1 本ずつはっきり見せる(行が少ないとき、縦にぼかさず、横だけなめらかに伸ばす)。
// 小さな画像を大きく見せるとき(3 倍以上)は、画素をぼかさない
export function drawGrayImage(ctx, colors, values, w, h, rect, { min = 0, max = VALUE_MAX, rows = h, crispRows = false, smooth } = {}) {
  const count = Math.max(0, Math.min(h, Math.floor(rows)))
  if (count === 0) return
  const lut = grayLut(colors)
  const k = 255 / (max - min)
  const toIndex = (v) => {
    const t = (v - min) * k
    return t > 0 ? (t >= 255 ? 255 : (t + 0.5) | 0) : 0
  }
  const drawH = (rect.h * count) / h
  if (crispRows && drawH / count >= 1.5) {
    const outH = Math.max(1, Math.round(drawH))
    const px = takePixels(w * outH)
    for (let y = 0; y < outH; y++) {
      const src = Math.min(count - 1, Math.floor((y * count) / outH)) * w
      for (let x = 0; x < w; x++) {
        const i = toIndex(values[src + x]) * 3
        const o = (y * w + x) * 4
        px[o] = lut[i]
        px[o + 1] = lut[i + 1]
        px[o + 2] = lut[i + 2]
        px[o + 3] = 255
      }
    }
    blitPixels(ctx, px, w, outH, rect.x, rect.y, rect.w, outH, { smooth: true })
    return
  }
  const px = takePixels(w * count)
  for (let j = 0, total = w * count; j < total; j++) {
    const i = toIndex(values[j]) * 3
    const o = j * 4
    px[o] = lut[i]
    px[o + 1] = lut[i + 1]
    px[o + 2] = lut[i + 2]
    px[o + 3] = 255
  }
  const scale = Math.min(rect.w / w, drawH / count)
  blitPixels(ctx, px, w, count, rect.x, rect.y, rect.w, drawH, { smooth: smooth ?? scale < 3 })
}

// 画像の枠(画像の外側に 1 px)
export function drawFrame(ctx, colors, rect) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, rect.w + 1, rect.h + 1)
  ctx.restore()
}

// まだ撮っていない(足していない)部分の斜線
export function drawHatch(ctx, colors, rect, spacing = 7) {
  if (rect.h <= 0 || rect.w <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.strokeStyle = colors.alpha('muted', 0.4)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let d = -rect.h; d < rect.w; d += spacing) {
    ctx.moveTo(rect.x + d, rect.y + rect.h)
    ctx.lineTo(rect.x + d + rect.h, rect.y)
  }
  ctx.stroke()
  ctx.restore()
}

// 画像の上に重ねる文字。暗い角に明るい字、ふちは暗い色(どの灰色の上でも読める)
export function drawHaloText(ctx, colors, text, x, y, { align = 'left', baseline = 'top', size = 12 } = {}) {
  const { dark, light } = grayEnds(colors)
  ctx.save()
  ctx.font = uiFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = `rgb(${dark.join(' ')} / 0.85)`
  ctx.fillStyle = `rgb(${light.join(' ')})`
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
  ctx.restore()
}
// 画像の左上のタイトル
export function drawImageTitle(ctx, colors, text, rect) {
  drawHaloText(ctx, colors, text, rect.x + 6, rect.y + 5)
}

// 軸の目盛り: ticks は [{ at: 0〜1(画像の中の位置)、label }]。下側(bottom)と左側(left)に、目盛りの線と数を描く
export function drawBottomTicks(ctx, colors, rect, ticks, { size = 10 } = {}) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.fillStyle = colors.ink
  ctx.font = monoFont(size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.beginPath()
  for (const t of ticks) {
    const x = Math.round(rect.x + t.at * rect.w) + 0.5
    ctx.moveTo(x, rect.y + rect.h + 1)
    ctx.lineTo(x, rect.y + rect.h + 5)
  }
  ctx.stroke()
  for (const t of ticks) ctx.fillText(t.label, rect.x + t.at * rect.w, rect.y + rect.h + 7)
  ctx.restore()
}
export function drawLeftTicks(ctx, colors, rect, ticks, { size = 10 } = {}) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.fillStyle = colors.ink
  ctx.font = monoFont(size)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.beginPath()
  for (const t of ticks) {
    const y = Math.round(rect.y + t.at * rect.h) + 0.5
    ctx.moveTo(rect.x - 5, y)
    ctx.lineTo(rect.x - 1, y)
  }
  ctx.stroke()
  for (const t of ticks) ctx.fillText(t.label, rect.x - 7, rect.y + t.at * rect.h)
  ctx.restore()
}

// ---- 世界(模型)の座標 ↔ 画面 --------------------------------------------------------------------

// 画像の枠 image(正方形、模型の [−1, 1]² に当たる)の中心を原点にした、世界 ↔ 画面(y は上向き)
export function worldView(image) {
  const cx = image.x + image.w / 2
  const cy = image.y + image.h / 2
  const scale = image.w / 2
  return {
    scale,
    cx,
    cy,
    sx: (x) => cx + x * scale,
    sy: (y) => cy - y * scale,
    wx: (px) => (px - cx) / scale,
    wy: (py) => (cy - py) / scale,
  }
}

// 点を丸でつかむ絵の当たり判定: 点(世界の座標)のうち、画面の位置 p にいちばん近いもの。半径 radius(CSS px)の外なら -1
export function nearestHandle(view, handles, p, radius) {
  let best = -1
  let bestDistance = radius
  handles.forEach(([x, y], i) => {
    const d = Math.hypot(p.x - view.sx(x), p.y - view.sy(y))
    if (d <= bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}

// ---- 平行ビームの絵 ----------------------------------------------------------------------------

export const BEAM_RAYS = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]

// X 線の向きの角度 theta で、線源の側の線、検出器の線、平行な光線を描く。
// 光線は x cosθ + y sinθ = s(s は検出器に沿う位置)。検出器は光線の向き d = (−sinθ, cosθ) の先、線源はその反対側。
//   active: 目立たせる光線の s(なければ null)  handle: 線源をつかめる丸(accent の塗り)にする  arrow: 検出器の + の側(s が増える向き)に矢じりを描く
export function drawBeam(ctx, colors, view, theta, { rays = BEAM_RAYS, half = 0.82, radius = 1.08, active = null, handle = false, arrow = false, rayAlpha = 0.5 } = {}) {
  const c = Math.cos(theta)
  const sn = Math.sin(theta)
  const at = (a, b) => [view.sx(a * c - b * sn), view.sy(a * sn + b * c)] // 点 a n + b d
  ctx.save()
  // 光線
  ctx.strokeStyle = colors.alpha('lane-1', rayAlpha)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const s of rays) {
    const [x0, y0] = at(s, -radius)
    const [x1, y1] = at(s, radius)
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
  }
  ctx.stroke()
  if (active !== null) {
    const [x0, y0] = at(active, -radius)
    const [x1, y1] = at(active, radius)
    ctx.strokeStyle = colors.alpha('surface', 0.9)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.strokeStyle = colors.alpha('lane-1', 1)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  // 線源の側の線(細い破線)と、検出器(太い線。ふちに surface を敷いて、暗い画像の上でも見えるように)
  const [sx0, sy0] = at(-half, -radius)
  const [sx1, sy1] = at(half, -radius)
  ctx.strokeStyle = colors.alpha('ink', 0.55)
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(sx0, sy0)
  ctx.lineTo(sx1, sy1)
  ctx.stroke()
  ctx.setLineDash([])
  const [dx0, dy0] = at(-half, radius)
  const [dx1, dy1] = at(half, radius)
  ctx.lineCap = 'butt'
  ctx.strokeStyle = colors.alpha('surface', 0.9)
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.stroke()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(dx0, dy0)
  ctx.lineTo(dx1, dy1)
  ctx.stroke()
  // 検出器の + の側の矢じり(s が増える向き)
  if (arrow) {
    const [ax, ay] = at(half + 0.08, radius)
    const [bx, by] = at(half, radius + 0.045)
    const [cx, cy] = at(half, radius - 0.045)
    ctx.fillStyle = colors.ink
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
    ctx.fill()
  }
  // 線源
  const [px, py] = at(0, -radius)
  ctx.beginPath()
  ctx.arc(px, py, handle ? 8 : 6, 0, Math.PI * 2)
  ctx.fillStyle = handle ? colors.accent : colors.alpha('lane-3', 1)
  ctx.fill()
  ctx.strokeStyle = handle ? colors.ink : colors.surface
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  return { source: [px, py], detector: (s) => at(s, radius) }
}

// 検出器に沿う位置 s、光線に沿う位置 along(線源 −、検出器 +)の点の画面の座標(drawBeam の at と同じ)
export function beamPoint(view, theta, s, along) {
  const c = Math.cos(theta)
  const sn = Math.sin(theta)
  return [view.sx(s * c - along * sn), view.sy(s * sn + along * c)]
}

// 縁取りした丸(暗い画像の上でも明るい画像の上でも見える)。selected なら accent で塗る
export function drawRing(ctx, colors, x, y, radius, { selected = false } = {}) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  if (selected) {
    ctx.fillStyle = colors.alpha('accent', 0.55) // 中の楕円が透けて見える
    ctx.fill()
  }
  ctx.strokeStyle = colors.alpha('surface', 0.95)
  ctx.lineWidth = selected ? 4.5 : 3.5
  ctx.stroke()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = selected ? 2 : 1.25
  ctx.stroke()
  ctx.restore()
}

// 折れ線(まず太い surface、その上に色)。灰色の画像の上でも読めるように
export function strokeHalo(ctx, colors, points, { color, width = 2, dash = [] }) {
  if (points.length < 2) return
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.setLineDash(dash)
  for (const [stroke, lineWidth] of [[colors.alpha('surface', 0.85), width + 3], [color, width]]) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }
  ctx.restore()
}

// ---- 全体の画面の割り付け ----------------------------------------------------------------------

// 全体の 3 つの絵(模型・サイノグラム・再構成)の置き場所。画像は正方形で、模型の枠だけ BEAM_MARGIN 倍(線源と検出器を描く余白)。
// 幅が 600px 以上なら 3 つ横に並べ、それ以外は 上に 模型とサイノグラム、下に 再構成(2 + 1)。
// height は canvas の高さ(CSS の上限で切られたとき、収まるよう画像を小さくする)。needed は、幅から決まる高さ(縦横比に使う)
export function overviewLayout(width, height = Infinity) {
  const pad = 6
  const gap = 10
  const label = 30 // サイノグラムの左の目盛りの数
  const kind = width >= 600 ? 'row' : 'two-one'
  if (kind === 'row') {
    const full = (width - 2 * pad - 2 * gap - label) / (BEAM_MARGIN + 2)
    const needed = BEAM_MARGIN * Math.min(full, 300) + 2 * pad
    const S = Math.max(48, Math.min(full, 300, (height - 2 * pad) / BEAM_MARGIN))
    const used = (BEAM_MARGIN + 2) * S + 2 * gap + label
    const x0 = (width - used) / 2
    const outerH = BEAM_MARGIN * S
    const y0 = Number.isFinite(height) ? Math.max(pad, (height - outerH) / 2) : pad
    const phantomOuter = { x: x0, y: y0, w: outerH, h: outerH }
    const phantomImage = { x: x0 + (outerH - S) / 2, y: y0 + (outerH - S) / 2, w: S, h: S }
    const sino = { x: x0 + outerH + gap + label, y: phantomImage.y, w: S, h: S }
    const recon = { x: sino.x + S + gap, y: phantomImage.y, w: S, h: S }
    return { kind, needed, phantomOuter, phantomImage, sino, recon }
  }
  const S1full = Math.min(220, (width - 2 * pad - gap - label) / (BEAM_MARGIN + 1))
  const S2full = Math.min(330, width - 2 * pad)
  const rowGap = 12
  const neededOf = (S1, S2) => BEAM_MARGIN * S1 + rowGap + S2 + 2 * pad
  const needed = neededOf(S1full, S2full)
  let S1 = Math.max(48, S1full)
  let S2 = Math.max(80, S2full)
  if (neededOf(S1, S2) > height) {
    // 高さが足りないときは、まず下の再構成、それでも足りなければ上の 2 つも小さくする
    S2 = Math.max(120, height - BEAM_MARGIN * S1 - rowGap - 2 * pad)
    if (neededOf(S1, S2) > height) {
      const f = (height - rowGap - 2 * pad) / (BEAM_MARGIN * S1 + S2)
      S1 = Math.max(48, S1 * f)
      S2 = Math.max(80, S2 * f)
    }
  }
  const used1 = (BEAM_MARGIN + 1) * S1 + gap + label
  const x0 = (width - used1) / 2
  const outerH = BEAM_MARGIN * S1
  const total = neededOf(S1, S2)
  const y0 = Number.isFinite(height) ? Math.max(pad, (height - (total - 2 * pad)) / 2) : pad
  const phantomOuter = { x: x0, y: y0, w: outerH, h: outerH }
  const phantomImage = { x: x0 + (outerH - S1) / 2, y: y0 + (outerH - S1) / 2, w: S1, h: S1 }
  const sino = { x: x0 + outerH + gap + label, y: phantomImage.y, w: S1, h: S1 }
  const recon = { x: (width - S2) / 2, y: y0 + outerH + rowGap, w: S2, h: S2 }
  return { kind, needed, phantomOuter, phantomImage, sino, recon }
}

// ---- グラフ(軸と目盛り) -------------------------------------------------------------------------

// グラフの枠 plot({ x, y, w, h })に、データの範囲 xRange・yRange を写す。log なら y を常用対数で(範囲は 10 のべき)
export function plotMap(plot, xRange, yRange, { logY = false } = {}) {
  const fy = logY ? Math.log10 : (v) => v
  const y0 = fy(yRange[0])
  const y1 = fy(yRange[1])
  return {
    plot,
    px: (x) => plot.x + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plot.w,
    py: (y) => plot.y + plot.h - ((fy(Math.max(y, yRange[0])) - y0) / (y1 - y0)) * plot.h,
    xr: (px) => xRange[0] + ((px - plot.x) / plot.w) * (xRange[1] - xRange[0]),
  }
}

// 左と下の軸、目盛り(xTicks・yTicks は [{ v, label }])、横線(line)、横軸の名前(xName。最後の目盛りの右)。
// 軸と目盛りの線は muted、数と名前は ink。縦軸の名前は、呼ぶ側が軸の上に書く(下付きは labelKit の drawSubLabel)
export function drawPlotAxes(ctx, colors, map, { xTicks, yTicks, xName }) {
  const { plot } = map
  ctx.save()
  ctx.strokeStyle = colors.line
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const t of yTicks) {
    const y = Math.round(map.py(t.v)) + 0.5
    ctx.moveTo(plot.x, y)
    ctx.lineTo(plot.x + plot.w, y)
  }
  ctx.stroke()
  ctx.strokeStyle = colors.muted
  ctx.beginPath()
  ctx.moveTo(plot.x + 0.5, plot.y)
  ctx.lineTo(plot.x + 0.5, plot.y + plot.h + 0.5)
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h + 0.5)
  for (const t of xTicks) {
    const x = Math.round(map.px(t.v)) + 0.5
    ctx.moveTo(x, plot.y + plot.h)
    ctx.lineTo(x, plot.y + plot.h + 4)
  }
  for (const t of yTicks) {
    const y = Math.round(map.py(t.v)) + 0.5
    ctx.moveTo(plot.x - 4, y)
    ctx.lineTo(plot.x, y)
  }
  ctx.stroke()
  ctx.fillStyle = colors.ink
  ctx.font = monoFont(11)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const t of xTicks) ctx.fillText(t.label, map.px(t.v), plot.y + plot.h + 7)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const t of yTicks) ctx.fillText(t.label, plot.x - 7, map.py(t.v))
  if (xName) {
    ctx.font = uiFont(12)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(xName, plot.x + plot.w + 9, plot.y + plot.h + 6)
  }
  ctx.restore()
}
