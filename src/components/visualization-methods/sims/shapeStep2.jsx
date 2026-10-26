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
import { lerpPoint } from '../../../utils/vis/curve'
import { drawControlPoints, drawPolyline, hitControlPoint, nearestCurveSample, sampleCurve } from './shapeKit'

const INITIAL = [[0.8, 0.8], [3.3, 2.3]]
const POINT_R = 7

export default function ShapeStep2() {
  const [points, setPoints] = useState(() => INITIAL.map((point) => point.slice()))
  const [t, setT] = useState(0.4)
  const [selected, setSelected] = useState(0)
  const [selectedT, setSelectedT] = useState(false)
  const dragging = useRef(null)
  const p = lerpPoint(points[0], points[1], t)
  const samples = useMemo(() => sampleCurve((u) => lerpPoint(points[0], points[1], u), 160), [points])
  const viewOf = (width, height) => makeView({ width, height, xRange: [0, 4], yRange: [0, 3], margin: STEP_MARGIN })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    drawPolyline(ctx, view, points, { color: colors.ink, width: 2.25 })
    drawControlPoints(ctx, view, points, colors, { selected: selectedT ? -1 : selected })
    markerCircle(ctx, view.sx(p[0]), view.sy(p[1]), POINT_R, {
      fill: laneColor(colors, 0), stroke: colors.ink, lineWidth: selectedT ? 3 : 1.5,
    })
    drawText(ctx, 'P(t)', view.sx(p[0]), view.sy(p[1]) - 12, { color: colors.ink, align: 'center' })
    const leftMid = lerpPoint(points[0], p, 0.5)
    const rightMid = lerpPoint(p, points[1], 0.5)
    drawText(ctx, fmt(t, 2), view.sx(leftMid[0]), view.sy(leftMid[1]) - 8, { color: colors.ink, align: 'center' })
    drawText(ctx, fmt(1 - t, 2), view.sx(rightMid[0]), view.sy(rightMid[1]) - 8, { color: colors.ink, align: 'center' })
    drawText(ctx, 't : (1 − t)', view.sx(p[0]), view.sy(p[1]) + 18, { color: colors.muted, align: 'center' })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    const control = hitControlPoint(view, points, position)
    const curve = nearestCurveSample(view, samples, position)
    const overP = Math.hypot(position.x - view.sx(p[0]), position.y - view.sy(p[1])) <= POINT_R + GRAB_SLOP_PX
    return { view, control, curve, overP }
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const info = pointerInfo(position)
      return info.control >= 0 || info.overP
    },
    onDown: (position) => {
      const info = pointerInfo(position)
      if (info.control >= 0) {
        dragging.current = { type: 'control', index: info.control }
        setSelected(info.control)
        setSelectedT(false)
        return
      }
      if (info.overP) {
        dragging.current = { type: 't' }
        setSelectedT(true)
        setT(info.curve.u)
        return
      }
      return false
    },
    onMove: (position) => {
      const { view, curve } = pointerInfo(position)
      if (dragging.current?.type === 't') setT(curve.u)
      if (dragging.current?.type === 'control') {
        const index = dragging.current.index
        setPoints((current) => current.map((point, i) => i === index
          ? [clamp(view.wx(position.x), 0, 4), clamp(view.wy(position.y), 0, 3)]
          : point))
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      setSelected((value) => value === 0 ? 1 : 0)
      setSelectedT(false)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedT) setT((value) => clamp(value + (step.dx + step.dy) * 0.01, 0, 1))
    else setPoints((current) => current.map((point, i) => i === selected ? [clamp(point[0] + step.dx * 0.1, 0, 4), clamp(point[1] + step.dy * 0.1, 0, 3)] : point))
  }
  const reset = () => {
    setPoints(INITIAL.map((point) => point.slice()))
    setT(0.4)
    setSelected(0)
    setSelectedT(false)
  }
  return (
    <SimShell
      label="線形補間"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="2 点 P0、P1 と、その間を比 t 対 1−t に分ける点 P(t)。3 個の点をつかんで動かせる。矢印キーで選択中の点を動かし、PageUp と PageDown で端点を選べる" />}
      legend={<SimLegend items={[
        { key: 'p', symbol: 'P(t)', label: '内分点', value: `(${fmt(p[0], 2)}, ${fmt(p[1], 2)})`, minChars: 14 },
        { key: 'ratio', label: '長さの比', value: `${fmt(t, 2)} : ${fmt(1 - t, 2)}`, minChars: 13 },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="t" label="内分の比" value={t} min={0} max={1} step={0.01} onChange={(value) => { setT(value); setSelectedT(true) }} format={(value) => value.toFixed(2)} />
        </>
      }
    />
  )
}
