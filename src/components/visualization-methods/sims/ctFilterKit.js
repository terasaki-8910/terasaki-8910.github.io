// CT タブの段階 6〜10 が共通で使う補助: 絵の枠の割り付け、灰色の画素の絵、小さなグラフ、断面の画像。
// 画素の値の濃淡は volumeKit.js の valueRamp と同じ決まり(ink と surface のうち暗い方が低い値)。volumeKit は読み込みの
// ときに 64³ のボリュームを作る(約 0.4 秒)ので、CT の段階には写してある。
import { useEffect, useLayoutEffect, useState } from 'react'
import { makeView, drawAxes } from '../../visualization/axes'
import { monoFont } from '../../visualization/canvasFont'
import { blitPixels } from './pixelKit'
import { SHEPP_LOGAN, fbp, seededRandom, sinogram } from '../../../utils/vis/ct'

// ---- 割り付け ----------------------------------------------------------------------------------

// canvas の幅がこれより狭いとき(スマホ)は、枠を縦に積む。広いときは横に並べる
export const NARROW_WIDTH = 520

// 絵の枠(canvas の親)の幅。幅によって絵の並べ方と高さを変えるので、state で持つ(ResizeObserver で追う)。
// 測りは描画の前(useLayoutEffect)なので、最初の仮の値で一瞬描かれることはない
export function useStageWidth(canvasRef) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 700 : Math.max(280, Math.min(window.innerWidth - 32, 1152))))
  useLayoutEffect(() => {
    const parent = canvasRef.current?.parentElement
    if (!parent) return undefined
    const update = () => setWidth(Math.round(parent.clientWidth))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [canvasRef])
  return width
}

// SimShell の height(段階の絵の高さ)を、いまの高さ 1 つに決める(スマホ・PC とも同じ値)
export const fixedHeight = (h) => ({ phone: [h, h], pc: [h, h] })

// area を cols × rows に等分した枠(行ごとに左から)
export function splitCells(area, cols, rows, gap) {
  const w = (area.w - gap * (cols - 1)) / cols
  const h = (area.h - gap * (rows - 1)) / rows
  const cells = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: area.x + c * (w + gap), y: area.y + r * (h + gap), w, h })
  return cells
}

export const insideRect = (r, p, slop = 0) => p.x >= r.x - slop && p.x <= r.x + r.w + slop && p.y >= r.y - slop && p.y <= r.y + r.h + slop

// 枠の幅(cell)から余白を引いたグラフの内側。左は y の目盛りの数、上はタイトル、下は x の目盛りの数の分
export const PLOT_MARGIN = { left: 36, right: 8, top: 22, bottom: 20 }

// ---- 灰色の画素の絵 ----------------------------------------------------------------------------

const lutCache = new WeakMap()

// 値 0〜255 の段ごとの灰色(ink と surface のうち暗い方 → 明るい方)。colors ごとに 1 回だけ作る
function grayLut(colors) {
  let lut = lutCache.get(colors)
  if (!lut) {
    const dark = colors.dark ? colors.rgb.surface : colors.rgb.ink
    const light = colors.dark ? colors.rgb.ink : colors.rgb.surface
    lut = new Uint8ClampedArray(256 * 3)
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(dark[c] + (light[c] - dark[c]) * (i / 255))
    lutCache.set(colors, lut)
  }
  return lut
}

// 0〜1 の値の灰色 [r, g, b](0〜255)
export function grayRgb(colors, value) {
  const lut = grayLut(colors)
  const t = Math.round(Math.max(0, Math.min(1, value)) * 255)
  return [lut[t * 3], lut[t * 3 + 1], lut[t * 3 + 2]]
}

// 値の配列(w × h)を、lo〜hi を灰色の 0〜1 にして RGBA にする
export function grayPixels(colors, data, w, h, lo, hi) {
  const lut = grayLut(colors)
  const out = new Uint8ClampedArray(w * h * 4)
  const scale = 255 / (hi - lo || 1)
  for (let i = 0; i < w * h; i++) {
    let t = Math.round((data[i] - lo) * scale)
    t = t < 0 ? 0 : t > 255 ? 255 : t
    out[i * 4] = lut[t * 3]
    out[i * 4 + 1] = lut[t * 3 + 1]
    out[i * 4 + 2] = lut[t * 3 + 2]
    out[i * 4 + 3] = 255
  }
  return out
}

// 画素の絵を枠(rect)いっぱいに描き、細い枠線を付ける。smooth: false なら画素の境をぼかさない
export function drawGrayImage(ctx, colors, data, w, h, rect, { lo = 0, hi = 1, smooth = true } = {}) {
  blitPixels(ctx, grayPixels(colors, data, w, h, lo, hi), w, h, rect.x, rect.y, rect.w, rect.h, { smooth })
  frameRect(ctx, colors, rect)
}

export function frameRect(ctx, colors, rect) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1)
  ctx.restore()
}

// 断面の画像の表示の範囲(頭蓋骨は白く飽和し、脳の中の値 0.2 と小さな楕円の 0.3 の差が見える。全体の絵と同じ)
export const SLICE_WINDOW = [0, 0.6]

// 凡例の色見本(灰色の濃淡の帯)。濃淡は低い値が暗い方なので、ライトでは ink → surface、ダークでは surface → ink。
// テーマが変わっても描き直しが起きない凡例のために、テーマの属性を見て持つ
export function useGraySwatch() {
  const isDark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark ? 'linear-gradient(90deg, var(--color-surface), var(--color-ink))' : 'linear-gradient(90deg, var(--color-ink), var(--color-surface))'
}

// 画像の上のつまみ。明るい所でも暗い所でも見えるよう、surface のふち取りの上に accent の塗りと ink の線
export function drawGrabHandle(ctx, colors, x, y, { r = 5, selected = false } = {}) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.lineWidth = selected ? 5.5 : 4
  ctx.strokeStyle = colors.surface
  ctx.stroke()
  ctx.fillStyle = colors.accent
  ctx.fill()
  ctx.lineWidth = selected ? 2.5 : 1.5
  ctx.strokeStyle = colors.ink
  ctx.stroke()
  ctx.restore()
}

// ---- 小さなグラフ ------------------------------------------------------------------------------

// 枠 cell の中に置く、x と y を別々に伸ばしたグラフの view(canvas 全体の座標のまま)
export function plotView(size, cell, xRange, yRange, margin) {
  const m = { ...PLOT_MARGIN, ...margin }
  return makeView({
    width: size.width,
    height: size.height,
    xRange,
    yRange,
    equal: false,
    margin: {
      left: cell.x + m.left,
      right: size.width - cell.x - cell.w + m.right,
      top: cell.y + m.top,
      bottom: size.height - cell.y - cell.h + m.bottom,
    },
  })
}

export const ticks = (values, step) => ({ step, values })

// 軸・目盛り・タイトル(軸の枠の上に、左そろえ)
export function drawPlotAxes(ctx, colors, view, { title, xTicks, yTicks }) {
  drawAxes(ctx, view, { colors, yLabel: title, xTicks, yTicks })
}

// 軸の枠の外に出さない
export function withClip(ctx, view, draw) {
  const { frame } = view
  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.left, frame.top, frame.width, frame.height)
  ctx.clip()
  draw()
  ctx.restore()
}

export function strokeSeries(ctx, view, xs, ys, { color, width = 1.5, dash = [] }) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.setLineDash(dash)
  ctx.beginPath()
  for (let i = 0; i < xs.length; i++) {
    const x = view.sx(xs[i])
    const y = view.sy(ys[i])
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

// 値が 0 の所の水平な点線(軸は枠の下の辺にあり、負の値があるグラフでは 0 の位置が分からないため)
export function drawZeroLine(ctx, colors, view, y = 0) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(view.frame.left, Math.round(view.sy(y)) + 0.5)
  ctx.lineTo(view.frame.right, Math.round(view.sy(y)) + 0.5)
  ctx.stroke()
  ctx.restore()
}

// ---- 向きを回す取っ手(段階 6 の模型の図) --------------------------------------------------------

// 取っ手を押した所(中心からの dx、上向きを正にした dy)から、投影の向き θ(度、0〜179)を返す。
// 検出器は光線の進む向き v = (−sinθ, cosθ) の先にあるので、取っ手の向きの角度は θ + 90°。
// 取っ手は θ = 0(真上)から θ = 180°(真下)まで、左側の半円を動く。右側は近い方の端に寄せる
export function dialAngle(dx, dyUp) {
  let phi = Math.atan2(dyUp, dx)
  if (phi < 0) phi += 2 * Math.PI
  const theta = Math.max(0, Math.min(Math.PI, phi - Math.PI / 2))
  return Math.min(179, Math.round((theta * 180) / Math.PI))
}

// ---- 断面の画像(段階 8〜10) ---------------------------------------------------------------------

export const SLICE_N = 64
let sliceCache = null

// 模型を 180 方向・検出器 96 個で撮って、ランプフィルタで作り直した 64 × 64 の断面。段階 8〜10 の入力
export function sliceImage() {
  if (!sliceCache) sliceCache = fbp(sinogram(SHEPP_LOGAN, 180, 96), 180, 96, SLICE_N, 'ram-lak')
  return sliceCache
}

// 平均 0、標準偏差 sigma の細かい乱れ(種つき。Box–Muller)。素材の雑音の見本で、方法の式ではない
export function gaussianGrain(img, sigma, seed) {
  const rand = seededRandom(seed)
  const out = new Float64Array(img.length)
  for (let i = 0; i < img.length; i++) {
    const u1 = Math.max(rand(), 1e-12)
    out[i] = img[i] + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand())
  }
  return out
}

// ---- 虫めがね(段階 8・9): 画素の近傍と、数の格子 -------------------------------------------------

// 画像(w × h)の (cx, cy) を中心にした (2r+1) × (2r+1) の近傍の値(行ごとに左から)。画像の外は端の値のくり返し(imageFilter と同じ)
export function neighborhood(img, w, h, cx, cy, r) {
  const out = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.min(w - 1, Math.max(0, cx + dx))
      const y = Math.min(h - 1, Math.max(0, cy + dy))
      out.push(img[y * w + x])
    }
  }
  return out
}

// 画像の枠(rect)の上に、(cx, cy) を中心にした (2r+1) 画素四方の虫めがねの枠を描く(surface のふち取りの上に ink の線)
export function drawLens(ctx, colors, rect, w, h, cx, cy, r) {
  const sx = rect.w / w
  const sy = rect.h / h
  const x = rect.x + (cx - r) * sx
  const y = rect.y + (cy - r) * sy
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.strokeStyle = colors.surface
  ctx.lineWidth = 3.5
  ctx.strokeRect(x, y, (2 * r + 1) * sx, (2 * r + 1) * sy)
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, (2 * r + 1) * sx, (2 * r + 1) * sy)
  ctx.restore()
}

export const GRID_CELL_W = 31
export const GRID_CELL_H = 16

// 数の格子。values は cols 列の並び。region(番号の集合)は薄く塗って、まわりを太い線で囲む。center の番号は枠で囲む。
// 数字は format で文字にする(負の数は fmt で − にする)
export function drawNumberGrid(ctx, colors, x, y, values, cols, { format, region, center } = {}) {
  const rows = values.length / cols
  ctx.save()
  ctx.font = monoFont(11)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cellX = (i) => x + (i % cols) * GRID_CELL_W
  const cellY = (i) => y + Math.floor(i / cols) * GRID_CELL_H
  if (region) {
    ctx.fillStyle = colors.alpha('ink', 0.16)
    for (const i of region) ctx.fillRect(cellX(i), cellY(i), GRID_CELL_W, GRID_CELL_H)
  }
  ctx.fillStyle = colors.ink
  values.forEach((v, i) => ctx.fillText(format(v), cellX(i) + GRID_CELL_W / 2, cellY(i) + GRID_CELL_H / 2 + 0.5))
  ctx.strokeStyle = colors.line
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c <= cols; c++) { ctx.moveTo(x + c * GRID_CELL_W + 0.5, y); ctx.lineTo(x + c * GRID_CELL_W + 0.5, y + rows * GRID_CELL_H) }
  for (let r = 0; r <= rows; r++) { ctx.moveTo(x, y + r * GRID_CELL_H + 0.5); ctx.lineTo(x + cols * GRID_CELL_W, y + r * GRID_CELL_H + 0.5) }
  ctx.stroke()
  if (region) {
    // 領域のまわり: 隣の格子が領域の外(か格子の外)の辺だけに線を引く
    const inside = new Set(region)
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const i of region) {
      const c = i % cols
      const r = Math.floor(i / cols)
      const left = cellX(i)
      const top = cellY(i)
      if (c === 0 || !inside.has(i - 1)) { ctx.moveTo(left, top); ctx.lineTo(left, top + GRID_CELL_H) }
      if (c === cols - 1 || !inside.has(i + 1)) { ctx.moveTo(left + GRID_CELL_W, top); ctx.lineTo(left + GRID_CELL_W, top + GRID_CELL_H) }
      if (r === 0 || !inside.has(i - cols)) { ctx.moveTo(left, top); ctx.lineTo(left + GRID_CELL_W, top) }
      if (r === rows - 1 || !inside.has(i + cols)) { ctx.moveTo(left, top + GRID_CELL_H); ctx.lineTo(left + GRID_CELL_W, top + GRID_CELL_H) }
    }
    ctx.stroke()
  }
  if (center !== undefined) {
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 2])
    ctx.strokeRect(cellX(center) + 2, cellY(center) + 2, GRID_CELL_W - 4, GRID_CELL_H - 4)
  }
  ctx.restore()
}
