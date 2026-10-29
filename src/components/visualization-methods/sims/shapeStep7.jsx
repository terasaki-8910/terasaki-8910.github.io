import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { bezierDerivative, bezierPoint, curvature2D, frame2D } from '../../../utils/vis/curve'
import { cycleSelection, drawControlPoints, drawDivider, drawGraphAxes, drawPolyline, focusOnGrab, hitControlPoint, nearestCurveSample, pageStep, rangesForAspect, sampleCurve } from './shapeKit'

const INITIAL = [[0.45, 0.7], [1.15, 3], [3.2, 2.7], [4.2, 0.8]]
const POINT_R = 7
const copyInitial = () => INITIAL.map((point) => point.slice())
// 縦に並べるときのグラフの余白。絵より詰める(上は軸の名前の分、下は目盛りの文字の分だけ)
const STACKED_GRAPH_MARGIN = { ...STEP_MARGIN, top: 20, bottom: 24 }
const offsetYView = (view, offset) => ({
  ...view,
  sy: (y) => view.sy(y) + offset,
  wy: (y) => view.wy(y - offset),
  frame: { ...view.frame, top: view.frame.top + offset, bottom: view.frame.bottom + offset },
})
const offsetXView = (view, offset) => ({
  ...view,
  sx: (x) => view.sx(x) + offset,
  wx: (x) => view.wx(x - offset),
  frame: { ...view.frame, left: view.frame.left + offset, right: view.frame.right + offset },
})

export default function ShapeStep7() {
  const [points, setPoints] = useState(copyInitial)
  const [t, setT] = useState(0.42)
  const [selected, setSelected] = useState(0)
  const [selectedT, setSelectedT] = useState(true)
  const dragging = useRef(null)
  const curve = useMemo(() => sampleCurve((u) => bezierPoint(points, u), 300), [points])
  const curvature = useMemo(() => Array.from({ length: 241 }, (_, i) => {
    const u = i / 240
    return [u, curvature2D(bezierDerivative(points, u, 1), bezierDerivative(points, u, 2))]
  }), [points])
  const current = bezierPoint(points, t)
  const d1 = bezierDerivative(points, t, 1)
  const d2 = bezierDerivative(points, t, 2)
  const kappa = curvature2D(d1, d2)
  const radius = Math.abs(kappa) < 1e-8 ? Infinity : 1 / Math.abs(kappa)
  const frame = frame2D(d1)
  const bendSign = kappa < 0 ? -1 : 1
  const normal = [frame.normal[0] * bendSign, frame.normal[1] * bendSign]
  const graphLimit = Math.max(0.5, Math.min(6, curvature.reduce((maximum, entry) => Math.max(maximum, Math.abs(entry[1])), 0) * 1.08))

  const viewsOf = (width, height) => {
    if (width >= height * 1.6) {
      const split = Math.min(width * 0.68, Math.max(180, width * 0.57))
      const geometry = makeView({ width: split, height, ...rangesForAspect([0, 4.7], [0, 3.5], split, height), margin: STEP_MARGIN })
      const graphBase = makeView({ width: width - split, height, xRange: [0, 1], yRange: [-graphLimit, graphLimit], equal: false, margin: STEP_MARGIN })
      return { geometry, graph: offsetXView(graphBase, split), split, sideBySide: true }
    }
    const split = Math.max(155, Math.round(height * 0.6))
    const geometry = makeView({ width, height: split, ...rangesForAspect([0, 4.7], [0, 3.5], width, split), margin: STEP_MARGIN })
    const graphBase = makeView({ width, height: height - split, xRange: [0, 1], yRange: [-graphLimit, graphLimit], equal: false, margin: STACKED_GRAPH_MARGIN })
    return { geometry, graph: offsetYView(graphBase, split), split, sideBySide: false }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { geometry, graph, split, sideBySide } = viewsOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, geometry, { colors, xLabel: 'x', yLabel: 'y' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(geometry.frame.left, geometry.frame.top, geometry.frame.width, geometry.frame.height)
    ctx.clip()
    drawPolyline(ctx, geometry, points, { color: colors.muted, width: 1.25, dash: [5, 4] })
    drawPolyline(ctx, geometry, curve.map((sample) => sample.point), { color: colors.ink, width: 2.25 })
    if (Number.isFinite(radius) && radius <= 16) {
      const center = [current[0] + normal[0] * radius, current[1] + normal[1] * radius]
      ctx.strokeStyle = laneColor(colors, 1)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(geometry.sx(center[0]), geometry.sy(center[1]), radius * geometry.scaleX, 0, 2 * Math.PI)
      ctx.stroke()
    }
    drawArrow(ctx, geometry, current[0], current[1], current[0] + frame.tangent[0], current[1] + frame.tangent[1], { color: laneColor(colors, 3), width: 2 })
    drawArrow(ctx, geometry, current[0], current[1], current[0] + normal[0], current[1] + normal[1], { color: laneColor(colors, 4), width: 2 })
    markerCircle(ctx, geometry.sx(current[0]), geometry.sy(current[1]), POINT_R, { fill: laneColor(colors, 0), stroke: colors.ink, lineWidth: selectedT ? 3 : 1.5 })
    ctx.restore()
    // 制御点の名前は絵の枠の外に出ることがある(上の端に近い点)ので、切り取りの外で描く
    drawControlPoints(ctx, geometry, points, colors, { selected: selectedT ? -1 : selected })

    if (sideBySide) drawDivider(ctx, colors, split, 14, split, height - 14)
    else drawDivider(ctx, colors, 14, split, width - 14, split)
    drawGraphAxes(ctx, graph, {
      colors,
      xTicks: [0, 0.5, 1],
      yTicks: [-graphLimit, 0, graphLimit],
      yFormat: (value) => fmt(value, 1),
      xLabel: 't',
      yLabel: 'κ',
      xAxisY: graph.sy(0),
    })
    drawPolyline(ctx, graph, curvature.map(([u, value]) => [u, clamp(value, -graphLimit, graphLimit)]), { color: colors.ink, width: 2 })
    ctx.save()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = selectedT ? 4 : 2 // 選んでいるときは太く(縁の太さで選択を示す)
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(graph.sx(t), graph.frame.top)
    ctx.lineTo(graph.sx(t), graph.frame.bottom)
    ctx.stroke()
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const views = viewsOf(width, height)
    const control = hitControlPoint(views.geometry, points, position)
    const nearest = nearestCurveSample(views.geometry, curve, position)
    const overPoint = Math.hypot(position.x - views.geometry.sx(current[0]), position.y - views.geometry.sy(current[1])) <= POINT_R + GRAB_SLOP_PX
    return { ...views, control, nearest, overPoint }
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const info = pointerInfo(position)
      return info.control >= 0 || info.overPoint
    },
    onDown: focusOnGrab(canvasRef, (position) => {
      const info = pointerInfo(position)
      if (info.control >= 0) {
        dragging.current = { type: 'control', index: info.control }
        setSelected(info.control)
        setSelectedT(false)
        return
      }
      if (info.overPoint) {
        dragging.current = { type: 't' }
        setSelectedT(true)
        setT(info.nearest.u)
        return
      }
      return false
    }),
    onMove: (position) => {
      const info = pointerInfo(position)
      if (dragging.current?.type === 't') setT(info.nearest.u)
      if (dragging.current?.type === 'control') {
        const index = dragging.current.index
        setPoints((currentPoints) => currentPoints.map((point, i) => i === index
          ? [clamp(info.geometry.wx(position.x), 0, 4.7), clamp(info.geometry.wy(position.y), 0, 3.5)]
          : point))
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    const move = pageStep(event)
    if (move) {
      event.preventDefault()
      // 制御点 → 曲線上の点の順に巡る
      const next = cycleSelection(selected, selectedT, move, points.length)
      setSelected(next.selected)
      setSelectedT(next.onCurve)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedT) setT((value) => clamp(value + (step.dx + step.dy) * 0.01, 0, 1))
    else setPoints((currentPoints) => currentPoints.map((point, i) => i === selected
      ? [clamp(point[0] + step.dx * 0.1, 0, 4.7), clamp(point[1] + step.dy * 0.1, 0, 3.5)]
      : point))
  }
  const reset = () => {
    setPoints(copyInitial())
    setT(0.42)
    setSelected(0)
    setSelectedT(true)
  }

  return (
    <SimShell
      label="接線・法線・曲率"
      height={{ phone: [320, 400], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="3 次ベジエ曲線の接線、曲がる側の法線、接触円と、曲率のグラフ。制御点と曲線上の点をドラッグで動かせる。矢印キー(Shift で 5 倍)で選択中のものを動かし、PageUp と PageDown で 4 個の制御点と曲線上の点を順に選べる" />}
      legend={<SimLegend items={[
        { key: 'curve', label: 'ベジエ曲線', swatch: 'var(--color-ink)' },
        { key: 'tangent', symbol: 'T', label: '単位接線', swatch: 'var(--lane-3)' },
        { key: 'normal', symbol: 'N', label: '単位法線', swatch: 'var(--lane-4)' },
        { key: 'kappa', symbol: '\\kappa', label: '曲率', value: fmt(kappa, 3), minChars: 8 },
        { key: 'radius', symbol: 'R', label: '接触円の半径', value: Number.isFinite(radius) ? fmt(radius, 2) : '∞', minChars: 8 },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="t" label="曲線上の位置" value={t} min={0} max={1} step={0.01} onChange={(value) => { setT(value); setSelectedT(true) }} format={(value) => value.toFixed(2)} />
        </>
      }
    />
  )
}
