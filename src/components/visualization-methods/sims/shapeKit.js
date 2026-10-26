import { GRAB_SLOP_PX, markerCircle } from '../../visualization/sims/rigidKit'

export const CONTROL_R = 7

export function drawPolyline(ctx, view, points, { color, width = 2, dash = [] } = {}) {
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
    else ctx.lineTo(view.sx(x), view.sy(y))
  })
  ctx.stroke()
  ctx.restore()
}

export function drawControlPoints(ctx, view, points, colors, { selected = -1, labels = true } = {}) {
  points.forEach(([x, y], i) => {
    markerCircle(ctx, view.sx(x), view.sy(y), CONTROL_R, {
      fill: colors.accent,
      stroke: colors.ink,
      lineWidth: i === selected ? 3.5 : 1.5,
    })
    if (labels) {
      ctx.fillStyle = colors.ink
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`P${i}`, view.sx(x), view.sy(y) - 10)
    }
  })
}

export function hitControlPoint(view, points, position, radius = CONTROL_R + GRAB_SLOP_PX) {
  let best = -1
  let bestDistance = radius
  points.forEach(([x, y], i) => {
    const distance = Math.hypot(position.x - view.sx(x), position.y - view.sy(y))
    if (distance <= bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

export function sampleCurve(pointAt, count = 240) {
  return Array.from({ length: count + 1 }, (_, i) => ({ u: i / count, point: pointAt(i / count) }))
}

export function nearestCurveSample(view, samples, position) {
  let nearest = samples[0]
  let distance = Infinity
  samples.forEach((sample) => {
    const d = Math.hypot(position.x - view.sx(sample.point[0]), position.y - view.sy(sample.point[1]))
    if (d < distance) {
      nearest = sample
      distance = d
    }
  })
  return { ...nearest, distance }
}

export function convexHull(points) {
  if (points.length <= 2) return points.map((point) => point.slice())
  const sorted = points.map((point) => point.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = []
  sorted.forEach((point) => {
    while (half.length >= 2 && cross(half.at(-2), half.at(-1), point) <= 0) half.pop()
    half.push(point)
  })
  const lower = half.slice()
  half.length = 0
  sorted.slice().reverse().forEach((point) => {
    while (half.length >= 2 && cross(half.at(-2), half.at(-1), point) <= 0) half.pop()
    half.push(point)
  })
  return lower.slice(0, -1).concat(half.slice(0, -1))
}

export function drawHull(ctx, view, points, colors) {
  const hull = convexHull(points)
  if (hull.length < 3) return
  ctx.save()
  ctx.fillStyle = colors.alpha('lane-0', 0.12)
  ctx.beginPath()
  hull.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
    else ctx.lineTo(view.sx(x), view.sy(y))
  })
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
