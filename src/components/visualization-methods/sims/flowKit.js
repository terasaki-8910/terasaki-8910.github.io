// 流れのタブ(flow)の共通の補助。速さの色、矢印と折れ線のまとめ描き、画面への写し方、つまみ、特異点の印、
// 灰色の画像、サンプルした場、再描画の間引き。React と canvas だけに頼り、速度の場の計算は src/utils/vis/flow.js が持つ。
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeView } from '../../visualization/axes'
import { GRAB_SLOP_PX, STEP_MARGIN, clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { monoFont, uiFont } from '../../visualization/canvasFont'
import { streamline } from '../../../utils/vis/flow'

export { STEP_MARGIN }

// ---- 画面への写し方 -------------------------------------------------------------------------

// 見せたい範囲を真ん中に置いたまま、短い方の軸の範囲を canvas の縦横比に合わせて広げる(shapeKit.js の rangesForAspect と同じ。
// shapeKit は形状のタブの道具で書き換わるので、ここには写した)
function rangesForAspect(xRange, yRange, width, height, margin) {
  const xCenter = (xRange[0] + xRange[1]) / 2
  const yCenter = (yRange[0] + yRange[1]) / 2
  let xSpan = xRange[1] - xRange[0]
  let ySpan = yRange[1] - yRange[0]
  const frameWidth = width - (margin.left ?? 0) - (margin.right ?? 0)
  const frameHeight = height - (margin.top ?? 0) - (margin.bottom ?? 0)
  const aspect = frameWidth / Math.max(frameHeight, 1)
  if (xSpan / ySpan < aspect) xSpan = ySpan * aspect
  else ySpan = xSpan / aspect
  return {
    xRange: [xCenter - xSpan / 2, xCenter + xSpan / 2],
    yRange: [yCenter - ySpan / 2, yCenter + ySpan / 2],
  }
}

// 見せたい範囲を真ん中に置いたまま、短い方の軸の範囲を canvas の縦横比に合わせて広げた view(x と y は同じ縮尺)。
// 場が全体で決まっている(渦、回転など)ときは、広げた範囲の全体に場を描く
export function fitView(width, height, xRange, yRange, margin = STEP_MARGIN) {
  const fitted = rangesForAspect(xRange, yRange, width, height, margin)
  return makeView({ width, height, xRange: fitted.xRange, yRange: fitted.yRange, margin, equal: true })
}

// view が映している世界の範囲 [x0, y0, x1, y1]
export const boundsOf = (view) => [view.xRange[0], view.yRange[0], view.xRange[1], view.yRange[1]]

// 動かせる点を、世界の範囲 box(既定は view が映す範囲)の中に収める。つまみが枠で欠けないよう、縁から px だけ内側に残す
export function clampInside(view, x, y, box = boundsOf(view), px = 10) {
  const m = px / view.scaleX
  return [clamp(x, box[0] + m, box[2] - m), clamp(y, box[1] + m, box[3] - m)]
}

// PageUp(前)は -1、PageDown(次)は 1、ほかのキーは 0。選ぶ物(渦など)を 1 つずつ巡るのに使う。
// Alt・Ctrl・Cmd つきはブラウザの操作(Ctrl+PageDown でタブを移るなど)に残すので 0
export function pageStep(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0
  if (event.key === 'PageUp') return -1
  if (event.key === 'PageDown') return 1
  return 0
}

// 枠の中だけに描く(世界の絵は軸の枠の外に出さない)
export function clipToFrame(ctx, view, draw) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
  ctx.clip()
  draw()
  ctx.restore()
}

// ---- 速さの色: 遅い = ink、速い = lane-1 の間を混ぜる -------------------------------------------------

export const SPEED_BINS = 20
const lutCache = new WeakMap()

export const rgbText = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(' ')})`
export const mixRgb = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t)

// colors(useCanvas の draw に渡るもの)ごとに作って覚える。テーマが変わると colors が新しくなるので作り直される
export function speedLut(colors, bins = SPEED_BINS) {
  let byBins = lutCache.get(colors)
  if (!byBins) {
    byBins = new Map()
    lutCache.set(colors, byBins)
  }
  if (!byBins.has(bins)) {
    byBins.set(bins, Array.from({ length: bins }, (_, i) => rgbText(mixRgb(colors.rgb.ink, colors.rgb['lane-1'], bins === 1 ? 0 : i / (bins - 1)))))
  }
  return byBins.get(bins)
}

export const speedBin = (speed, vmax, bins = SPEED_BINS) => Math.min(bins - 1, Math.max(0, Math.floor((speed / vmax) * bins)))

export const SPEED_SWATCH = 'linear-gradient(to right, var(--color-ink), var(--lane-1))'

// ---- まとめ描き ------------------------------------------------------------------------------

// 色の段ごとに Path2D を 1 つずつ持ち、最後にまとめて stroke する(線を 1 本ずつ stroke すると遅い)
export class PathBins {
  constructor(count) {
    this.paths = new Array(count).fill(null)
  }

  path(bin) {
    return this.paths[bin] ?? (this.paths[bin] = new Path2D())
  }

  stroke(ctx, lut) {
    this.paths.forEach((path, i) => {
      if (!path) return
      ctx.strokeStyle = lut[i]
      ctx.stroke(path)
    })
  }
}

// 矢印(軸 + 開いた矢じり)を色の段ごとにまとめて描く。data は 1 本あたり 5 個の数 [x0, y0, x1, y1, 段]、座標は画面の px。
// 長さが 1.2 px より短い矢印は点にする
export function drawArrowBatches(ctx, data, count, lut, { width = 1.4, headMax = 7, headRatio = 0.4 } = {}) {
  const bins = new PathBins(lut.length)
  for (let i = 0; i < count; i++) {
    const o = i * 5
    const x0 = data[o]
    const y0 = data[o + 1]
    const x1 = data[o + 2]
    const y1 = data[o + 3]
    const path = bins.path(data[o + 4])
    const dx = x1 - x0
    const dy = y1 - y0
    const length = Math.hypot(dx, dy)
    if (length < 1.2) {
      path.moveTo(x0, y0)
      path.lineTo(x0 + 0.1, y0)
      continue
    }
    const ux = dx / length
    const uy = dy / length
    const head = Math.min(headMax, headRatio * length)
    path.moveTo(x0, y0)
    path.lineTo(x1, y1)
    path.moveTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5)
    path.lineTo(x1, y1)
    path.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5)
  }
  ctx.save()
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  bins.stroke(ctx, lut)
  ctx.restore()
}

// 開いた矢じり(「>」の形)を 1 つ、点 (x, y) に、向き (ux, uy) で描く。パスに足すだけ
export function addChevron(path, x, y, ux, uy, size) {
  path.moveTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55)
  path.lineTo(x, y)
  path.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55)
}

// ---- 文字 -------------------------------------------------------------------------------------

// ラベル。halo を渡すと、その色で縁取る(線や色の上でも読めるように)
export function drawLabel(ctx, text, x, y, { color, halo, size = 11, align = 'center', baseline = 'middle', mono = false } = {}) {
  ctx.save()
  ctx.font = mono ? monoFont(size) : uiFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  if (halo) {
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = halo
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ---- つまみ -----------------------------------------------------------------------------------

export const HANDLE_R = 7
export const HANDLE_HIT = HANDLE_R + GRAB_SLOP_PX + 4

// 動かせる点。accent は塗りだけ(意味を伝える線には使わない)、輪郭は ink。強調すると輪郭が太くなる
export function drawHandle(ctx, px, py, colors, emphasis = false) {
  markerCircle(ctx, px, py, HANDLE_R, { fill: colors.accent, stroke: colors.ink, lineWidth: emphasis ? 3.5 : 1.5 })
}

// 画面の点 p に一番近いつまみ(半径 radius 以内)の番号。なければ -1。points は [{ px, py }]
export function nearestHandle(points, p, radius = HANDLE_HIT) {
  let best = -1
  let bestDistance = radius
  points.forEach((point, i) => {
    const d = Math.hypot(p.x - point.px, p.y - point.py)
    if (d <= bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}

// ---- 特異点の印 -------------------------------------------------------------------------------

export const CRITICAL_ORDER = ['saddle', 'center', 'source', 'sink', 'spiral-out', 'spiral-in']
export const CRITICAL_LABEL = {
  saddle: '鞍点',
  center: '渦心',
  source: '湧き出し',
  sink: '吸い込み',
  'spiral-out': 'らせん（外へ）',
  'spiral-in': 'らせん（内へ）',
}
export const CRITICAL_MARK = { saddle: '×', center: '○', source: '▲', sink: '▼', 'spiral-out': '@', 'spiral-in': '@' }

function criticalPath(ctx, type, x, y, s) {
  ctx.beginPath()
  if (type === 'saddle') {
    ctx.moveTo(x - s, y - s)
    ctx.lineTo(x + s, y + s)
    ctx.moveTo(x - s, y + s)
    ctx.lineTo(x + s, y - s)
  } else if (type === 'center') {
    ctx.arc(x, y, s, 0, Math.PI * 2)
  } else if (type === 'source') {
    ctx.moveTo(x, y - s * 1.15)
    ctx.lineTo(x + s * 1.05, y + s * 0.8)
    ctx.lineTo(x - s * 1.05, y + s * 0.8)
    ctx.closePath()
  } else if (type === 'sink') {
    ctx.moveTo(x, y + s * 1.15)
    ctx.lineTo(x + s * 1.05, y - s * 0.8)
    ctx.lineTo(x - s * 1.05, y - s * 0.8)
    ctx.closePath()
  } else {
    // らせん: 中心から外へ 1.5 回転する小さな渦巻き。外向きは先に矢じりの代わりの点、内向きは中心の点
    const turns = 1.5
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * turns * Math.PI * 2
      const r = (s * i) / 24
      const px = x + r * Math.cos(a)
      const py = y + r * Math.sin(a)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
  }
}

// 特異点の種類ごとの印(鞍点 ×、渦心 ○、湧き出し ▲、吸い込み ▼、らせん @)。地(surface)の色で縁取ってから ink で描く
export function drawCriticalSymbol(ctx, type, x, y, colors, size = 6) {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  criticalPath(ctx, type, x, y, size)
  ctx.strokeStyle = colors.surface
  ctx.lineWidth = 5
  ctx.stroke()
  if (type === 'source' || type === 'sink') {
    ctx.fillStyle = colors.surface
    ctx.fill()
  }
  criticalPath(ctx, type, x, y, size)
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  ctx.stroke()
  if (type === 'spiral-in') {
    markerCircle(ctx, x, y, 1.8, { fill: colors.ink })
  } else if (type === 'spiral-out') {
    markerCircle(ctx, x + size * Math.cos(1.5 * Math.PI * 2), y + size * Math.sin(1.5 * Math.PI * 2), 1.8, { fill: colors.ink })
  }
  ctx.restore()
}

// ---- 灰色の画像(LIC・ノイズ) ---------------------------------------------------------------------

// 値(0〜1)の濃淡: ink と surface のうち暗い方を低い値、明るい方を高い値にする灰色。paper はライトのテーマで黄色なので混ぜない
// (volumeKit.js の valueRamp と同じ規則。そちらは体積データを読み込むので、ここには写した)
const grayCache = new WeakMap()
export function grayLut(colors) {
  let lut = grayCache.get(colors)
  if (!lut) {
    const dark = colors.dark ? colors.rgb.surface : colors.rgb.ink
    const light = colors.dark ? colors.rgb.ink : colors.rgb.surface
    lut = new Uint8ClampedArray(256 * 3)
    for (let i = 0; i < 256; i++) {
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = dark[c] + ((light[c] - dark[c]) * i) / 255
    }
    grayCache.set(colors, lut)
  }
  return lut
}

// 値の割合 lo〜hi の位置の値(下から数えて)を、256 段のヒストグラムで求める。{ low, high }
export function percentileRange(values, lo = 0.02, hi = 0.98) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!(max > min)) return { low: min, high: min + 1 }
  const bins = 512
  const hist = new Uint32Array(bins)
  const scale = (bins - 1) / (max - min)
  for (let i = 0; i < values.length; i++) hist[((values[i] - min) * scale) | 0]++
  let acc = 0
  let low = min
  let high = max
  let foundLow = false
  for (let i = 0; i < bins; i++) {
    acc += hist[i]
    if (!foundLow && acc >= lo * values.length) {
      low = min + i / scale
      foundLow = true
    }
    if (acc >= hi * values.length) {
      high = min + (i + 1) / scale
      break
    }
  }
  return { low, high: Math.max(high, low + 1e-9) }
}

// 値を low〜high で 0〜1 に伸ばして灰色の RGBA(不透明)にする。pixels は w × h × 4 の Uint8ClampedArray
export function fillGrayPixels(values, low, high, lut, pixels) {
  const scale = 255 / (high - low)
  for (let i = 0; i < values.length; i++) {
    const g = Math.max(0, Math.min(255, Math.round((values[i] - low) * scale))) * 3
    const o = i * 4
    pixels[o] = lut[g]
    pixels[o + 1] = lut[g + 1]
    pixels[o + 2] = lut[g + 2]
    pixels[o + 3] = 255
  }
}

// 種つきの白色ノイズ(0〜1)
export function whiteNoise(count, rand) {
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) out[i] = rand()
  return out
}

// 画素数の目安 pixels に合わせた画像の大きさ(縦横比 aspect = 幅 / 高さ)
export function imageSize(aspect, pixels) {
  const h = Math.max(8, Math.round(Math.sqrt(pixels / aspect)))
  return { w: Math.max(8, Math.round(h * aspect)), h }
}

// ---- サンプルした場 ---------------------------------------------------------------------------------

// 解析的な場 field を範囲 bounds の格子点(nx × ny 個)で測り、双線形補間する場にする。
// 渦の和のように 1 回の計算が重い場を、LIC や多数の流線で何百万回も呼ぶときに速くする(範囲の外は端の値)
export function sampledField(field, bounds, nx, ny) {
  const [x0, y0, x1, y1] = bounds
  const dx = (x1 - x0) / (nx - 1)
  const dy = (y1 - y0) / (ny - 1)
  const u = new Float32Array(nx * ny)
  const v = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const f = field(x0 + i * dx, y0 + j * dy)
      u[i + nx * j] = f[0]
      v[i + nx * j] = f[1]
    }
  }
  const maxX = nx - 1.0001
  const maxY = ny - 1.0001
  return (x, y) => {
    let gx = (x - x0) / dx
    let gy = (y - y0) / dy
    gx = gx < 0 ? 0 : gx > maxX ? maxX : gx
    gy = gy < 0 ? 0 : gy > maxY ? maxY : gy
    const i = gx | 0
    const j = gy | 0
    const a = gx - i
    const b = gy - j
    const k = i + nx * j
    const w00 = (1 - a) * (1 - b)
    const w10 = a * (1 - b)
    const w01 = (1 - a) * b
    const w11 = a * b
    return [u[k] * w00 + u[k + 1] * w10 + u[k + nx] * w01 + u[k + nx + 1] * w11, v[k] * w00 + v[k + 1] * w10 + v[k + nx] * w01 + v[k + nx + 1] * w11]
  }
}

// 向きだけの場(長さ 1)。流線を「曲線に沿った長さ」で進めるために使う。速さが 0 の所は [0, 0]
export function unitField(field) {
  return (x, y, t) => {
    const v = field(x, y, t)
    const s = Math.hypot(v[0], v[1])
    return s < 1e-9 ? [0, 0] : [v[0] / s, v[1] / s]
  }
}

// 出発点から前後に流線をたどる(unit は unitField の場)。出発点に戻ってきたら(閉じた曲線)そこで止める。
// 1 周より長く引くと、同じ線が少しずれて重なって太く見えるため
export function traceLine(unit, seed, { h, maxSteps, bounds }) {
  const forward = streamline(unit, seed, { h, maxSteps, bounds, direction: 'forward' })
  let reach = 0
  for (let k = 1; k < forward.length; k++) {
    const d = Math.hypot(forward[k][0] - seed[0], forward[k][1] - seed[1])
    reach = Math.max(reach, d)
    if (k > 3 && reach > 1.5 * h && d < 1.2 * h) return forward.slice(0, k + 1)
  }
  return [...streamline(unit, seed, { h, maxSteps, bounds, direction: 'backward' }), ...forward.slice(1)]
}

// 折れ線の大きさ(外接する長方形の対角線の長さ)。渦の芯の中の、見えないほど小さな輪を除くのに使う
export function lineExtent(points) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p[0] < x0) x0 = p[0]
    if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]
    if (p[1] > y1) y1 = p[1]
  }
  return Math.hypot(x1 - x0, y1 - y0)
}

// ---- 渦のある場(出発点の置き方と LIC の段階で共通) ----------------------------------------------------

export const DEMO_STRENGTHS = [0.6, -0.5, 0.4]
export const DEMO_CORE = 0.1
export const DEMO_CENTERS = [[0.55, 0.62], [1.1, 0.4], [1.55, 0.68]]
export const DEMO_X_RANGE = [0, 2.1]
export const DEMO_Y_RANGE = [0, 1.1]

export const demoVortices = (centers) => centers.map((c, i) => ({ x: c[0], y: c[1], strength: DEMO_STRENGTHS[i], core: DEMO_CORE }))

// ---- React の補助 ---------------------------------------------------------------------------------

// redraw を、次の描画フレームに 1 回だけまとめる(ポインタの動きが毎回重い描き直しを呼ばないように)
export function useScheduledRedraw(redraw) {
  const frame = useRef(0)
  const latest = useRef(redraw)
  latest.current = redraw
  // StrictMode は効果を「作る → 片づける → 作る」と 2 回走らせる。片づけで予約を取り消したら、印(frame)も戻す。
  // 戻さないと、以後の schedule が「予約済み」と見なして何もしなくなる
  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])
  return useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      latest.current()
    })
  }, [])
}

const readDark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'

// ダークのテーマか(凡例の色見本の向きを変えるため)。テーマが変わると描き直す
export function useIsDark() {
  const [dark, setDark] = useState(readDark)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(readDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

// 灰色の濃淡の凡例用の色見本(暗い方 → 明るい方)
export const graySwatch = (dark) => (dark
  ? 'linear-gradient(to right, var(--color-surface), var(--color-ink))'
  : 'linear-gradient(to right, var(--color-ink), var(--color-surface))')
