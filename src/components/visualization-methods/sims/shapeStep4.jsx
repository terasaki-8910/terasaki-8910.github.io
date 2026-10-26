import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle, drawText } from '../../visualization/sims/rigidKit'
import { bernstein, bezierPoint } from '../../../utils/vis/curve'
import { drawControlPoints, drawHull, drawPolyline, hitControlPoint, rangesForAspect, sampleCurve } from './shapeKit'

const INITIAL = [[0.4, 0.5], [1.1, 2.5], [2.7, 2.4], [3.6, 0.6]]

const offsetView = (view, offset) => ({
  ...view,
  sx: (x) => view.sx(x) + offset,
  wx: (x) => view.wx(x - offset),
  frame: { ...view.frame, left: view.frame.left + offset, right: view.frame.right + offset },
})

export default function ShapeStep4() {
  const [points, setPoints] = useState(() => INITIAL.map((point) => point.slice()))
  const [t, setT] = useState(0.38)
  const [selected, setSelected] = useState(0)
  const [selectedT, setSelectedT] = useState(false)
  const dragging = useRef(null)
  const weights = Array.from({ length: 4 }, (_, i) => bernstein(3, i, t))
  const point = bezierPoint(points, t)
  const curve = useMemo(() => sampleCurve((u) => bezierPoint(points, u), 240), [points])
  const viewsOf = (width, height) => {
    const split = Math.min(width * 0.68, Math.max(180, width * 0.57))
    const geometry = makeView({ width: split, height, ...rangesForAspect([0, 4], [0, 3], split, height), margin: STEP_MARGIN })
    const graphBase = makeView({ width: width - split, height, xRange: [0, 1], yRange: [0, 1], equal: false, margin: STEP_MARGIN })
    return { geometry, graph: offsetView(graphBase, split), split }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { geometry, graph, split } = viewsOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, geometry, { colors, xLabel: 'x', yLabel: 'y' })
    ctx.strokeStyle = colors.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(split, 14)
    ctx.lineTo(split, height - 14)
    ctx.stroke()

    drawHull(ctx, geometry, points, colors)
    drawPolyline(ctx, geometry, points, { color: colors.muted, width: 1.25, dash: [5, 4] })
    drawPolyline(ctx, geometry, curve.map((sample) => sample.point), { color: colors.ink, width: 2.25 })
    drawControlPoints(ctx, geometry, points, colors, { selected: selectedT ? -1 : selected, labels: false })
    points.forEach(([x, y], i) => drawText(ctx, `P${i}  ${fmt(weights[i], 2)}`, geometry.sx(x), geometry.sy(y) - 11, { color: colors.ink, align: 'center' }))
    markerCircle(ctx, geometry.sx(point[0]), geometry.sy(point[1]), 6, { fill: laneColor(colors, 4), stroke: colors.ink, lineWidth: 1.5 })

    ctx.strokeStyle = colors.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(graph.frame.left, graph.frame.bottom)
    ctx.lineTo(graph.frame.right, graph.frame.bottom)
    ctx.moveTo(graph.frame.left, graph.frame.bottom)
    ctx.lineTo(graph.frame.left, graph.frame.top)
    ctx.stroke()
    drawText(ctx, 't', graph.frame.right, graph.frame.bottom + 17, { color: colors.ink, align: 'right' })
    drawText(ctx, 'B', graph.frame.left - 8, graph.frame.top, { color: colors.ink, align: 'right' })
    ;[0, 0.5, 1].forEach((tick) => {
      ctx.beginPath()
      ctx.moveTo(graph.sx(tick), graph.frame.bottom)
      ctx.lineTo(graph.sx(tick), graph.frame.bottom + 4)
      ctx.moveTo(graph.frame.left - 4, graph.sy(tick))
      ctx.lineTo(graph.frame.left, graph.sy(tick))
      ctx.stroke()
      drawText(ctx, String(tick), graph.sx(tick), graph.frame.bottom + 14, { color: colors.muted, align: 'center' })
      drawText(ctx, String(tick), graph.frame.left - 7, graph.sy(tick), { color: colors.muted, align: 'right', baseline: 'middle' })
    })

    for (let i = 0; i < 4; i++) {
      const basis = sampleCurve((u) => [u, bernstein(3, i, u)], 120)
      drawPolyline(ctx, graph, basis.map((sample) => sample.point), { color: laneColor(colors, i), width: 2 })
      markerCircle(ctx, graph.sx(t), graph.sy(weights[i]), 3.5, { fill: laneColor(colors, i), stroke: colors.surface, lineWidth: 1 })
    }
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = selectedT ? 3 : 2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(graph.sx(t), graph.frame.top)
    ctx.lineTo(graph.sx(t), graph.frame.bottom)
    ctx.stroke()
    ctx.setLineDash([])
    drawText(ctx, `Σ = ${fmt(weights.reduce((sum, value) => sum + value, 0), 2)}`, graph.frame.right, graph.frame.top + 12, { color: colors.ink, align: 'right' })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const views = viewsOf(width, height)
    const control = hitControlPoint(views.geometry, points, position)
    const overT = position.y >= views.graph.frame.top - GRAB_SLOP_PX
      && position.y <= views.graph.frame.bottom + GRAB_SLOP_PX
      && Math.abs(position.x - views.graph.sx(t)) <= GRAB_SLOP_PX
    return { ...views, control, overT }
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const info = pointerInfo(position)
      return info.control >= 0 || info.overT
    },
    onDown: (position) => {
      const info = pointerInfo(position)
      if (info.control >= 0) {
        dragging.current = { type: 'control', index: info.control }
        setSelected(info.control)
        setSelectedT(false)
        return
      }
      if (info.overT) {
        dragging.current = { type: 't' }
        setSelectedT(true)
        return
      }
      return false
    },
    onMove: (position) => {
      const { geometry, graph } = pointerInfo(position)
      if (dragging.current?.type === 't') setT(clamp(graph.wx(position.x), 0, 1))
      if (dragging.current?.type === 'control') {
        const index = dragging.current.index
        setPoints((current) => current.map((control, i) => i === index
          ? [clamp(geometry.wx(position.x), 0, 4), clamp(geometry.wy(position.y), 0, 3)]
          : control))
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const direction = event.key === 'PageUp' ? 1 : -1
      setSelected((selected + direction + points.length) % points.length)
      setSelectedT(false)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedT) setT((value) => clamp(value + (step.dx + step.dy) * 0.01, 0, 1))
    else setPoints((current) => current.map((control, i) => i === selected
      ? [clamp(control[0] + step.dx * 0.1, 0, 4), clamp(control[1] + step.dy * 0.1, 0, 3)]
      : control))
  }
  const reset = () => {
    setPoints(INITIAL.map((control) => control.slice()))
    setT(0.38)
    setSelected(0)
    setSelectedT(false)
  }

  return (
    <SimShell
      label="バーンスタイン基底"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="3 次ベジエ曲線と、4 個のバーンスタイン基底のグラフ。制御点またはグラフの縦線をつかんで動かせる。矢印キーで選択中のものを動かし、PageUp と PageDown で制御点を選べる" />}
      legend={<SimLegend items={[
        { key: 'curve', label: 'ベジエ曲線', swatch: 'var(--color-ink)' },
        ...weights.map((weight, i) => ({ key: `b${i}`, symbol: `B_${i}^3`, label: `P${i} の重み`, value: fmt(weight, 3), swatch: `var(--lane-${i})`, minChars: 7 })),
        { key: 'sum', symbol: '\\sum_i B_i^3', label: '重みの和', value: fmt(weights.reduce((sum, value) => sum + value, 0), 3) },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="t" label="基底を見る位置" value={t} min={0} max={1} step={0.01} onChange={(value) => { setT(value); setSelectedT(true) }} format={(value) => value.toFixed(2)} />
        </>
      }
    />
  )
}
