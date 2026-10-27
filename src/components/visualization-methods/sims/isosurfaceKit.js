import { makeView } from '../../visualization/axes'
import { monoFont } from '../../visualization/canvasFont'
import { STEP_MARGIN, clamp, drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { rangesForAspect } from './shapeKit'
import { blitPixels } from './pixelKit'

export const ISO_X_RANGE = [0, 4]
export const ISO_Y_RANGE = [0, 3]

export function makeIsoView(width, height, margin = STEP_MARGIN, xRange = ISO_X_RANGE, yRange = ISO_Y_RANGE) {
  const fitted = rangesForAspect(xRange, yRange, width, height, margin)
  return makeView({ width, height, ...fitted, margin, equal: true })
}

// PageUp(前)は -1、PageDown(次)は 1、ほかのキーは 0。Alt・Ctrl・Cmd つきはブラウザの操作
// (Ctrl+PageDown でタブを移るなど)に残すので 0
export function pageStep(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0
  if (event.key === 'PageUp') return -1
  if (event.key === 'PageDown') return 1
  return 0
}

// 0 〜 count-1 の輪の中で、番号 current から step(-1 か 1)だけ進めた番号
export const cycleIndex = (current, step, count) => (((current + step) % count) + count) % count

// 場の値 value を、surface(外)から lane-1(内)への色にする。[r, g, b]
export function rampRgb(colors, value, scale = 1) {
  const t = clamp(0.5 + value / (2 * Math.max(scale, 1e-6)), 0, 1)
  const outside = colors.rgb.surface
  const inside = colors.rgb['lane-1']
  return outside.map((v, i) => Math.round(v * (1 - t) + inside[i] * t))
}

export function rampColor(colors, value, scale = 1) {
  return `rgb(${rampRgb(colors, value, scale).join(' ')})`
}

// 相対輝度(WCAG)とコントラスト比
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

// 色 fill([r, g, b])の上に置く文字の色。ink と surface のうち、コントラストの高い方
// (ダークでは lane-1 が明るく、ink の文字が沈むので)
export function inkOn(colors, fill) {
  const lf = luminance(fill)
  return contrast(lf, luminance(colors.rgb.ink)) >= contrast(lf, luminance(colors.rgb.surface)) ? colors.ink : colors.surface
}

// 濃淡のある絵の上に置く文字の下に敷く板(surface を少し透かした色)。線や矢印より先に敷き、
// 線や矢印を描いたあとに drawText で文字を重ねる(板が線を隠さない)。引数は drawText と同じ
export function drawTextPlate(ctx, colors, text, x, y, { size = 11, align = 'left', baseline = 'alphabetic', pad = 3 } = {}) {
  ctx.save()
  ctx.font = monoFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  const m = ctx.measureText(text)
  ctx.fillStyle = colors.alpha('surface', 0.86)
  ctx.fillRect(
    x - m.actualBoundingBoxLeft - pad,
    y - m.actualBoundingBoxAscent - pad,
    m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 2 * pad,
    m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2 * pad,
  )
  ctx.restore()
}

// 3 次元の絵で「視点(回転)」を選んでいるときの印: 絵の縁の 2px の ink の枠と、左上の「視点」の文字
export function drawViewMark(ctx, colors, width, height) {
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)
  ctx.restore()
  drawTextPlate(ctx, colors, '視点', 12, 22, { size: 12 })
  drawText(ctx, '視点', 12, 22, { color: colors.ink, size: 12 })
}

export function drawFieldCells(ctx, view, colors, values, nx, ny, scale = 1) {
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const value = (
        values[i + nx * j] + values[i + 1 + nx * j]
        + values[i + nx * (j + 1)] + values[i + 1 + nx * (j + 1)]
      ) / 4
      const x0 = (4 * i) / (nx - 1)
      const x1 = (4 * (i + 1)) / (nx - 1)
      const y0 = (3 * j) / (ny - 1)
      const y1 = (3 * (j + 1)) / (ny - 1)
      ctx.fillStyle = rampColor(colors, value, scale)
      ctx.fillRect(view.sx(x0), view.sy(y1), view.sx(x1) - view.sx(x0) + 0.5, view.sy(y0) - view.sy(y1) + 0.5)
    }
  }
}

export function drawFieldImage(ctx, view, colors, field, { samplesX = 180, samplesY = 135, scale = 1, invert = false, xRange = ISO_X_RANGE, yRange = ISO_Y_RANGE } = {}) {
  const pixels = new Uint8ClampedArray(samplesX * samplesY * 4)
  const outside = colors.rgb.surface
  const inside = colors.rgb['lane-1']
  for (let py = 0; py < samplesY; py++) {
    for (let px = 0; px < samplesX; px++) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * (px + 0.5) / samplesX
      const y = yRange[0] + (yRange[1] - yRange[0]) * (samplesY - py - 0.5) / samplesY
      const value = field(x, y) * (invert ? -1 : 1)
      const t = clamp(0.5 + value / (2 * Math.max(scale, 1e-6)), 0, 1)
      const offset = 4 * (px + samplesX * py)
      for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round(outside[channel] * (1 - t) + inside[channel] * t)
      pixels[offset + 3] = 255
    }
  }
  blitPixels(
    ctx, pixels, samplesX, samplesY,
    view.sx(xRange[0]), view.sy(yRange[1]),
    view.sx(xRange[1]) - view.sx(xRange[0]), view.sy(yRange[0]) - view.sy(yRange[1]),
  )
}

export function drawSegments(ctx, view, segments, nx, ny, color, width = 2.5) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  for (const [a, b] of segments) {
    ctx.moveTo(view.sx((4 * a[0]) / (nx - 1)), view.sy((3 * a[1]) / (ny - 1)))
    ctx.lineTo(view.sx((4 * b[0]) / (nx - 1)), view.sy((3 * b[1]) / (ny - 1)))
  }
  ctx.stroke()
  ctx.restore()
}

// 粒子のつまみ。selected の番号のものは縁を太くする
export function drawBallHandles(ctx, view, balls, colors, selected = -1) {
  balls.forEach((ball, index) => markerCircle(ctx, view.sx(ball.x), view.sy(ball.y), 7, {
    fill: colors.accent,
    stroke: colors.ink,
    lineWidth: index === selected ? 3.5 : 1.5,
  }))
}

export function hitBall(view, balls, point, radius = 19) {
  let hit = -1
  let distance = radius
  balls.forEach((ball, index) => {
    const d = Math.hypot(point.x - view.sx(ball.x), point.y - view.sy(ball.y))
    if (d <= distance) {
      distance = d
      hit = index
    }
  })
  return hit
}

export function clipToFrame(ctx, view, draw) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
  ctx.clip()
  draw()
  ctx.restore()
}
