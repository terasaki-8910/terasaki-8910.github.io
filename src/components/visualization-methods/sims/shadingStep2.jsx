import { useEffect, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { lambert } from '../../../utils/vis/shading'
import { angleFromPoint, directionFromAngle, drawAngleHandle, drawPixelSphere, drawSemicircle, hitAngleHandle } from './shadingKit'

const INITIAL = 35 * Math.PI / 180
const ORIGIN = [0, 0]
const RADIUS = 1.55
const X_RANGE = [-3.2, 3.2]
const Y_RANGE = [-0.55, 2.55]
const TOP_BAND = 1.6 // 縦長の絵(スマホ)で、余弦グラフを置く上の帯の高さ(世界の長さ)。これだけ空けば帯に置く

// 縦長の絵では、上下の空白の帯を作らず、世界の範囲を上へ広げる(下の端はそのまま)。広がった上の帯に余弦グラフを置く
function viewOf(width, height) {
  const plotWidth = width - STEP_MARGIN.left - STEP_MARGIN.right
  const plotHeight = height - STEP_MARGIN.top - STEP_MARGIN.bottom
  const ySpan = plotHeight / (plotWidth / (X_RANGE[1] - X_RANGE[0]))
  const yRange = ySpan > Y_RANGE[1] - Y_RANGE[0] ? [Y_RANGE[0], Y_RANGE[0] + ySpan] : Y_RANGE
  return makeView({ width, height, xRange: X_RANGE, yRange, margin: STEP_MARGIN, equal: true })
}

// 余弦グラフの枠(画面の px)。上の帯があれば帯の右上に、なければ半円の右上(世界の座標の右上の空き)に置く
function graphRect(view) {
  const band = view.yRange[1] - Y_RANGE[1] >= TOP_BAND
  if (band) {
    const width = Math.min(130, view.frame.width * 0.4)
    return { left: view.frame.right - width - 14, top: view.frame.top + 12, width, height: 52 }
  }
  const left = view.sx(1.7)
  return { left, top: view.sy(2.25), width: Math.max(60, view.frame.right - left - 12), height: 64 }
}

export default function ShadingStep2() {
  const [angle, setAngle] = useState(INITIAL)
  const direction = directionFromAngle(angle)
  const brightness = lambert([0, 1, 0], direction)

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(view.sx(-2.8), view.sy(0))
    ctx.lineTo(view.sx(2.8), view.sy(0))
    ctx.stroke()
    drawSemicircle(ctx, view, ORIGIN, RADIUS, colors)
    drawArrow(ctx, view, 0, 0, 0, 1.15, { color: colors.ink, width: 2 })
    drawText(ctx, 'N', view.sx(0) + 9, view.sy(1.15), { color: colors.ink })
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, angle, colors, 'L', laneColor(colors, 0))

    const beamWidth = 0.34
    const tangent = [direction[1], -direction[0]]
    const top = [direction[0] * 2.35, direction[1] * 2.35]
    const intersections = []
    ;[-1, 1].forEach((side) => {
      const start = [top[0] + tangent[0] * beamWidth * side, top[1] + tangent[1] * beamWidth * side]
      const t = start[1] / Math.max(direction[1], 0.05)
      const end = [start[0] - direction[0] * t, 0]
      intersections.push(end[0])
      drawArrow(ctx, view, start[0], start[1], end[0], end[1], { color: colors.muted, width: 1.5 })
    })
    // 照射幅(平面に光が当たる範囲)。塗りだけだと地との差が小さいので、縁を lane-0 の線で引く
    const left = Math.min(...intersections)
    const right = Math.max(...intersections)
    ctx.fillStyle = colors.alpha('lane-0', 0.18)
    ctx.fillRect(view.sx(left), view.sy(0) - 5, view.sx(right) - view.sx(left), 10)
    ctx.strokeStyle = laneColor(colors, 0)
    ctx.lineWidth = 1.5
    ctx.strokeRect(view.sx(left), view.sy(0) - 5, view.sx(right) - view.sx(left), 10)
    drawText(ctx, `幅 ${fmt(1 / Math.max(brightness, 0.01), 2)} 倍`, view.sx((left + right) / 2), view.sy(0) + 18, { color: colors.ink, align: 'center' })

    // 余弦グラフ。右の余白は、90° の目盛りの文字と軸の名前 θ が枠(clip)で切れないため
    const { left: graphLeft, top: graphTop, width: graphWidth, height: graphHeight } = graphRect(view)
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(graphLeft, graphTop + graphHeight)
    ctx.lineTo(graphLeft + graphWidth, graphTop + graphHeight)
    ctx.moveTo(graphLeft, graphTop)
    ctx.lineTo(graphLeft, graphTop + graphHeight)
    ctx.stroke()
    ;[0, 1 / 3, 2 / 3, 1].forEach((tick, index) => {
      const x = graphLeft + graphWidth * tick
      ctx.beginPath()
      ctx.moveTo(x, graphTop + graphHeight)
      ctx.lineTo(x, graphTop + graphHeight + 4)
      ctx.stroke()
      drawText(ctx, `${index * 30}°`, x, graphTop + graphHeight + 14, { color: colors.ink, align: 'center' })
    })
    ;[0, 0.5, 1].forEach((tick) => {
      const y = graphTop + graphHeight * (1 - tick)
      ctx.beginPath()
      ctx.moveTo(graphLeft - 4, y)
      ctx.lineTo(graphLeft, y)
      ctx.stroke()
      drawText(ctx, String(tick), graphLeft - 7, y, { color: colors.ink, align: 'right', baseline: 'middle' })
    })
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= 80; i++) {
      const t = i / 80
      const x = graphLeft + graphWidth * t
      const y = graphTop + graphHeight * (1 - Math.cos(t * Math.PI / 2))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    markerCircle(ctx, graphLeft + graphWidth * Math.abs(angle) / (Math.PI / 2), graphTop + graphHeight * (1 - brightness), 4, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.25 })
    drawText(ctx, 'θ', graphLeft + graphWidth + 5, graphTop + graphHeight, { color: colors.ink, baseline: 'middle' })

    drawPixelSphere(ctx, view.sx(-2.35), view.sy(1.45), Math.min(38, view.scaleX * 0.48), colors, { L: [direction[0], 0, direction[1]], mode: 'lambert' })
    ctx.restore()

    // 明るさの棒: 枠が満点(1.0)の長さ、中の塗りが今の明るさ
    const barX = view.frame.left
    const barY = view.frame.top + 8
    const barW = Math.min(110, view.frame.width * 0.24)
    ctx.fillStyle = laneColor(colors, 1)
    ctx.fillRect(barX, barY, barW * brightness, 10)
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 9)
    drawText(ctx, '明るさ', barX, barY + 24, { color: colors.ink })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const hit = (point) => hitAngleHandle(viewOf(sizeRef.current.width, sizeRef.current.height), ORIGIN, RADIUS, angle, point)
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも操作できるように
      return undefined
    },
    onMove: (point) => setAngle(clamp(angleFromPoint(viewOf(sizeRef.current.width, sizeRef.current.height), ORIGIN, point), -Math.PI / 2, Math.PI / 2)),
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step || step.dx === 0) return // 上下のキーは使わない(ページのスクロールに残す)
    event.preventDefault()
    setAngle((value) => clamp(value + step.dx * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
  }

  return (
    <SimShell
      label="光が当たる角度"
      height={{ phone: [320, 400], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="平面へ当たる 2 本の光線と、その光が広がる照射幅、余弦のグラフ、明るさの棒、明暗のついた球を描いています。光 L のつまみをドラッグするか、左右の矢印キーで光の角度を 5 度ずつ変えられます(Shift を押すと 5 倍)。" />}
      legend={<SimLegend items={[
        { key: 'theta', symbol: '\\theta', label: '入射角', value: `${fmt(Math.abs(angle) * 180 / Math.PI, 1)}°`, minChars: 7 },
        { key: 'cos', symbol: '\\cos\\theta', label: '明るさ', value: fmt(brightness, 3), minChars: 6 },
        { key: 'area', label: '照射幅', value: `${fmt(1 / Math.max(brightness, 0.01), 2)} 倍`, minChars: 8 },
      ]} />}
      controls={<SimToolbar><ResetButton onClick={() => setAngle(INITIAL)} /></SimToolbar>}
    />
  )
}
