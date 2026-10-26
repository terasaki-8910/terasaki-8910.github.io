import { makeView } from '../../visualization/axes'
import { STEP_MARGIN, clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { rangesForAspect } from './shapeKit'

export const ISO_X_RANGE = [0, 4]
export const ISO_Y_RANGE = [0, 3]

export function makeIsoView(width, height, margin = STEP_MARGIN, xRange = ISO_X_RANGE, yRange = ISO_Y_RANGE) {
  const fitted = rangesForAspect(xRange, yRange, width, height, margin)
  return makeView({ width, height, ...fitted, margin, equal: true })
}

export function rampColor(colors, value, scale = 1) {
  const t = clamp(0.5 + value / (2 * Math.max(scale, 1e-6)), 0, 1)
  const outside = colors.rgb.surface
  const inside = colors.rgb['lane-1']
  return `rgb(${outside.map((v, i) => Math.round(v * (1 - t) + inside[i] * t)).join(' ')})`
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
  const image = ctx.createImageData(samplesX, samplesY)
  const outside = colors.rgb.surface
  const inside = colors.rgb['lane-1']
  for (let py = 0; py < samplesY; py++) {
    for (let px = 0; px < samplesX; px++) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * (px + 0.5) / samplesX
      const y = yRange[0] + (yRange[1] - yRange[0]) * (samplesY - py - 0.5) / samplesY
      const value = field(x, y) * (invert ? -1 : 1)
      const t = clamp(0.5 + value / (2 * Math.max(scale, 1e-6)), 0, 1)
      const offset = 4 * (px + samplesX * py)
      for (let channel = 0; channel < 3; channel++) image.data[offset + channel] = Math.round(outside[channel] * (1 - t) + inside[channel] * t)
      image.data[offset + 3] = 255
    }
  }
  const buffer = document.createElement('canvas')
  buffer.width = samplesX
  buffer.height = samplesY
  buffer.getContext('2d').putImageData(image, 0, 0)
  ctx.drawImage(buffer, view.sx(xRange[0]), view.sy(yRange[1]), view.sx(xRange[1]) - view.sx(xRange[0]), view.sy(yRange[0]) - view.sy(yRange[1]))
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
