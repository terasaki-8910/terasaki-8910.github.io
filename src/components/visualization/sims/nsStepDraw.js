// NsSim と同じ軸・色・矢印。段階の小さい格子でも物理座標は 1 m 四方。
import { makeView, drawAxes, drawArrow } from '../axes.js'
import { seriesView } from './fluidKit.js'
import { clamp } from './nsSteps.js'

export const TICKS = { step: 0.25, values: [0, 0.25, 0.5, 0.75, 1] }
export const fieldView = (width, height) => makeView({ width, height, xRange: [0, 1], yRange: [0, 1] })
export const lineView = (width, height, viscosity = false) =>
  seriesView({ width, height }, [0, 1], [viscosity ? -1 : -0.5, 1.5], { bottom: viscosity ? 40 : 66 })
export const inside = (view, p) => p.x >= view.frame.left && p.x <= view.frame.right && p.y >= view.frame.top && p.y <= view.frame.bottom
export function clipField(ctx, view) {
  const f = view.frame
  ctx.beginPath()
  ctx.rect(f.left, f.top, f.width, f.height)
  ctx.clip()
}

export function drawField({ ctx, width, height, colors }, raster, field, values, scale = 1, diverging = false) {
  const n = field.n
  if (!raster.current) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n
    const context = canvas.getContext('2d')
    raster.current = { canvas, context, image: context.createImageData(n, n) }
  }
  const r = raster.current
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const value = values[i + n * j] / (scale || 1)
      const amount = clamp(diverging ? Math.abs(value) : value, 0, 1)
      const color = colors.rgb[diverging && value < 0 ? 'diff-delete' : 'lane-1']
      const pixel = 4 * (i + n * (n - 1 - j))
      for (let c = 0; c < 3; c++) r.image.data[pixel + c] = colors.rgb.paper[c] + amount * (color[c] - colors.rgb.paper[c])
      r.image.data[pixel + 3] = 255
    }
  r.context.putImageData(r.image, 0, 0)
  ctx.fillStyle = colors.paper
  ctx.fillRect(0, 0, width, height)
  const view = fieldView(width, height),
    { frame } = view
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(r.canvas, frame.left, frame.top, frame.width, frame.height)
  return view
}

export function drawVelocity(ctx, view, field, color, fixedScale) {
  ctx.save()
  clipField(ctx, view)
  for (let j = 0; j < field.n; j += 2)
    for (let i = 0; i < field.n; i += 2) {
      const k = i + field.n * j,
        x = (i + 0.5) * field.dx,
        y = (j + 0.5) * field.dx
      const scale = fixedScale ?? Math.min(0.08, 0.045 / (Math.hypot(field.u[k], field.v[k]) || 1))
      drawArrow(ctx, view, x, y, x + scale * field.u[k], y + scale * field.v[k], { color, width: 1, head: 3 })
    }
  ctx.restore()
}
export function drawPush(ctx, view, point, colors) {
  if (!point) return
  const scale = 0.08 / (Math.hypot(point.fx, point.fy) || 1)
  ctx.save()
  clipField(ctx, view)
  drawArrow(ctx, view, point.x, point.y, point.x + scale * point.fx, point.y + scale * point.fy, { color: colors.ink, width: 3, head: 7 })
  ctx.restore()
}
export function fieldAxes(ctx, view, colors) {
  drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]', xTicks: TICKS, yTicks: TICKS })
}

export function keyDirection(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key]
  if (d) event.preventDefault()
  return d
}
