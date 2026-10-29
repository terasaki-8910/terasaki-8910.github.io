import { STEP_MARGIN, GRAB_SLOP_PX, markerCircle, drawText } from '../../visualization/sims/rigidKit'
import { monoFont } from '../../visualization/canvasFont'

export const CONTROL_R = 7

// PageUp(前)・PageDown(次)で、選ぶ物を 1 つずつ巡る。前は -1、次は 1、ほかのキーは 0。
// Alt・Ctrl・Cmd つきはブラウザの操作(Ctrl+PageDown でタブを移るなど)に残すので 0
export function pageStep(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0
  if (event.key === 'PageUp') return -1
  if (event.key === 'PageDown') return 1
  return 0
}

// つかんだあとも矢印キーで動かせるように、つかんだら canvas に focus を移す。usePointerDrag は pointerdown を
// preventDefault するので、押しただけでは focus が移らない。onDown が false(何もつかまなかった)のときは移さない。
//   usePointerDrag(canvasRef, { onDown: focusOnGrab(canvasRef, (position) => { ... }), ... })
export function focusOnGrab(canvasRef, onDown) {
  return (position) => {
    const result = onDown(position)
    if (result !== false) canvasRef.current?.focus({ preventScroll: true })
    return result
  }
}

// 制御点 0 〜 count-1 のあとに「曲線上の点」(t や u で動く点・縦線)を 1 つ足した輪を、step(-1 か 1)だけ進める。
// onCurve が true のときは曲線上の点を選んでいる。戻り値は新しい { selected, onCurve }
export function cycleSelection(selected, onCurve, step, count) {
  const at = onCurve ? count : selected
  const next = (at + step + count + 1) % (count + 1)
  return next === count ? { selected, onCurve: true } : { selected: next, onCurve: false }
}

export function rangesForAspect(xRange, yRange, width, height, margin = STEP_MARGIN) {
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
  })
  if (!labels) return
  // 文字の設定は戻す(useCanvas はフレームごとに状態を戻さない)
  ctx.save()
  ctx.fillStyle = colors.ink
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  points.forEach(([x, y], i) => ctx.fillText(`P${i}`, view.sx(x), view.sy(y) - 10))
  ctx.restore()
}

// 線が文字を横切っても読めるように、地の色で縁どった文字。align・baseline は canvas の textAlign・textBaseline の値
export function drawHaloText(ctx, text, x, y, { color, halo, size = 11, align = 'left', baseline = 'alphabetic' } = {}) {
  ctx.save()
  ctx.font = monoFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = halo
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

// 絵とグラフの仕切りの線。意味のある線ではないが、線の色は軸と同じ muted にそろえる(line は半透明で 1.3:1 しかない)
export function drawDivider(ctx, colors, x0, y0, x1, y1) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.restore()
}

// グラフ(絵の横や下に並べるもの。graph はずらした view)の軸・目盛り・軸の名前。
// 線は muted、文字は ink。軸の名前は目盛りの文字と重ならない所に置く(x は軸の右端の外、y は軸の上端の上)。
//   xTicks・yTicks   目盛りの値の配列。yFormat は y の目盛りの文字
//   xAxisY           x 軸の線の高さ(画面の y)。省略すると下の辺。目盛りはいつも下の辺に付く
export function drawGraphAxes(ctx, graph, { colors, xTicks, yTicks, xLabel, yLabel, yFormat = String, xAxisY } = {}) {
  const { frame } = graph
  const axisY = xAxisY ?? frame.bottom
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(frame.left, axisY)
  ctx.lineTo(frame.right, axisY)
  ctx.moveTo(frame.left, frame.bottom)
  ctx.lineTo(frame.left, frame.top)
  xTicks.forEach((tick) => {
    ctx.moveTo(graph.sx(tick), frame.bottom)
    ctx.lineTo(graph.sx(tick), frame.bottom + 4)
  })
  yTicks.forEach((tick) => {
    ctx.moveTo(frame.left - 4, graph.sy(tick))
    ctx.lineTo(frame.left, graph.sy(tick))
  })
  ctx.stroke()
  ctx.restore()
  xTicks.forEach((tick) => drawText(ctx, String(tick), graph.sx(tick), frame.bottom + 14, { color: colors.ink, align: 'center' }))
  yTicks.forEach((tick) => drawText(ctx, yFormat(tick), frame.left - 7, graph.sy(tick), { color: colors.ink, align: 'right', baseline: 'middle' }))
  drawText(ctx, xLabel, frame.right + 4, axisY, { color: colors.ink, baseline: 'middle' })
  drawText(ctx, yLabel, frame.left, frame.top - 8, { color: colors.ink, baseline: 'bottom' })
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
