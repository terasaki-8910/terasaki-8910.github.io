import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { SimToolbar, ResetButton, ToggleButton, ModeSwitch } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import {
  bezierDerivative,
  bezierPoint,
  bsplineDerivative,
  bsplinePoint,
  chaikin,
  curvature2D,
  frame2D,
  uniformKnots,
} from '../../../utils/vis/curve'
import { drawControlPoints, drawHull, drawPolyline, hitControlPoint, nearestCurveSample, sampleCurve } from './shapeKit'

const INITIAL_POINTS = [[0.8, 1.2], [1.8, 4.6], [3.2, 4.9], [4.2, 2], [5.4, 1.4], [6.6, 4.4], [7.4, 4.8]]
const MARKER_R = 7
const B_SPLINE_KNOTS = uniformKnots(7, 3)
const LIMIT_KNOTS = uniformKnots(7, 2)

const copyPoints = () => INITIAL_POINTS.map((point) => point.slice())
const safeEnd = (value, end) => value === end ? end - 1e-7 : value

export default function ShapeSim() {
  const [points, setPoints] = useState(copyPoints)
  const [mode, setMode] = useState('bezier')
  const [u, setU] = useState(0.4)
  const [levels, setLevels] = useState(2)
  const [showPolygon, setShowPolygon] = useState(true)
  const [showHull, setShowHull] = useState(true)
  const [showCircle, setShowCircle] = useState(true)
  const [selected, setSelected] = useState(0)
  const [curveSelected, setCurveSelected] = useState(false)
  const dragging = useRef(null)

  const curveMath = useMemo(() => {
    if (mode === 'bezier') {
      return {
        point: (v) => bezierPoint(points, v),
        d1: (v) => bezierDerivative(points, v, 1),
        d2: (v) => bezierDerivative(points, v, 2),
      }
    }
    const degree = mode === 'bspline' ? 3 : 2
    const knots = mode === 'bspline' ? B_SPLINE_KNOTS : LIMIT_KNOTS
    const end = mode === 'bspline' ? 4 : 5
    return {
      point: (v) => bsplinePoint(points, degree, knots, safeEnd(v * end, end)),
      d1: (v) => bsplineDerivative(points, degree, knots, safeEnd(v * end, end), 1),
      d2: (v) => bsplineDerivative(points, degree, knots, safeEnd(v * end, end), 2),
    }
  }, [mode, points])
  const samples = useMemo(() => sampleCurve(curveMath.point, 320), [curveMath])
  const current = curveMath.point(u)
  const d1 = curveMath.d1(u)
  const d2 = curveMath.d2(u)
  const kappa = curvature2D(d1, d2)
  const radius = Math.abs(kappa) < 1e-8 ? Infinity : 1 / Math.abs(kappa)
  const frame = frame2D(d1)

  const viewOf = (width, height) => makeView({ width, height, xRange: [0, 8], yRange: [0, 6], margin: STEP_MARGIN })
  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })

    if (mode === 'bezier' && showHull) drawHull(ctx, view, points, colors)
    if (showPolygon) drawPolyline(ctx, view, points, { color: colors.muted, width: 1.25, dash: [5, 4] })

    if (mode === 'subdivision') {
      const subdivided = chaikin(points, levels)
      drawPolyline(ctx, view, samples.map((sample) => sample.point), { color: colors.muted, width: 1.25, dash: [4, 4] })
      drawPolyline(ctx, view, subdivided, { color: colors.ink, width: 2.25 })
      subdivided.forEach(([x, y]) => markerCircle(ctx, view.sx(x), view.sy(y), 2.5, { fill: colors.ink }))
    } else {
      drawPolyline(ctx, view, samples.map((sample) => sample.point), { color: colors.ink, width: 2.25 })
    }

    if (mode === 'bspline') {
      for (let segment = 1; segment < 4; segment++) {
        const point = bsplinePoint(points, 3, B_SPLINE_KNOTS, segment)
        markerCircle(ctx, view.sx(point[0]), view.sy(point[1]), 3.5, { fill: laneColor(colors, 2), stroke: colors.surface, lineWidth: 1 })
      }
    }

    if (showCircle && radius <= 20) {
      const signedRadius = 1 / kappa
      const center = [current[0] + frame.normal[0] * signedRadius, current[1] + frame.normal[1] * signedRadius]
      ctx.strokeStyle = laneColor(colors, 1)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(view.sx(center[0]), view.sy(center[1]), radius * view.scaleX, 0, 2 * Math.PI)
      ctx.stroke()
    }

    drawArrow(ctx, view, current[0], current[1], current[0] + frame.tangent[0], current[1] + frame.tangent[1], { color: laneColor(colors, 3), width: 2 })
    drawArrow(ctx, view, current[0], current[1], current[0] + frame.normal[0], current[1] + frame.normal[1], { color: laneColor(colors, 4), width: 2 })
    markerCircle(ctx, view.sx(current[0]), view.sy(current[1]), MARKER_R, {
      fill: laneColor(colors, 0), stroke: colors.ink, lineWidth: curveSelected ? 3.5 : 1.5,
    })
    drawControlPoints(ctx, view, points, colors, { selected: curveSelected ? -1 : selected })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    const control = hitControlPoint(view, points, position)
    const curve = nearestCurveSample(view, samples, position)
    return { view, control, curve }
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const { control, curve } = pointerInfo(position)
      return control >= 0 || curve.distance <= MARKER_R + GRAB_SLOP_PX
    },
    onDown: (position) => {
      const { control, curve } = pointerInfo(position)
      if (control >= 0) {
        dragging.current = { type: 'control', index: control }
        setSelected(control)
        setCurveSelected(false)
        return
      }
      if (curve.distance <= MARKER_R + GRAB_SLOP_PX) {
        dragging.current = { type: 'curve' }
        setCurveSelected(true)
        setU(curve.u)
        return
      }
      return false
    },
    onMove: (position) => {
      const { view, curve } = pointerInfo(position)
      if (dragging.current?.type === 'curve') setU(curve.u)
      if (dragging.current?.type === 'control') {
        const next = points.map((point) => point.slice())
        next[dragging.current.index] = [clamp(view.wx(position.x), 0, 8), clamp(view.wy(position.y), 0, 6)]
        setPoints(next)
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const direction = event.key === 'PageUp' ? 1 : -1
      setSelected((selected + direction + points.length) % points.length)
      setCurveSelected(false)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (curveSelected) {
      setU((value) => clamp(value + (step.dx + step.dy) * 0.01, 0, 1))
      return
    }
    setPoints((currentPoints) => currentPoints.map((point, i) => i === selected
      ? [clamp(point[0] + step.dx * 0.1, 0, 8), clamp(point[1] + step.dy * 0.1, 0, 6)]
      : point))
  }

  const reset = () => {
    setPoints(copyPoints())
    setU(0.4)
    setLevels(2)
    setSelected(0)
    setCurveSelected(false)
  }
  const modeLabel = mode === 'bezier' ? '6 次・1 本' : mode === 'bspline' ? '3 次・4 区分' : `${levels} 回（${chaikin(points, levels).length} 点）`
  const legend = [
    { key: 'controls', label: '制御点', swatch: 'var(--color-accent)' },
    { key: 'curve', label: '曲線', swatch: 'var(--color-ink)' },
    { key: 'polygon', label: '制御点の折れ線', swatch: 'var(--color-muted)' },
    { key: 'circle', label: '曲率の円', swatch: 'var(--lane-1)' },
    { key: 'kappa', symbol: '\\kappa', label: '曲率', value: fmt(kappa, 3), minChars: 8 },
    { key: 'radius', symbol: 'R', label: '曲率半径', value: Number.isFinite(radius) ? fmt(radius, 2) : '∞', minChars: 8 },
    { key: 'degree', label: '次数・区分', value: modeLabel, minChars: 12 },
  ]

  return (
    <SimShell
      label="制御点から作る曲線"
      switcher={<ModeSwitch label="曲線の作り方" value={mode} options={[{ value: 'bezier', label: 'ベジエ' }, { value: 'bspline', label: 'B スプライン' }, { value: 'subdivision', label: '細分割' }]} onChange={setMode} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="7 個の制御点から作る曲線。制御点または曲線上の点をつかんで動かせる。矢印キーで選択中の点を動かし、PageUp と PageDown で制御点を選べる" />}
      legend={<SimLegend items={legend} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="u" label="曲線上の位置" value={u} min={0} max={1} step={0.01} onChange={(value) => { setU(value); setCurveSelected(true) }} format={(value) => value.toFixed(2)} />
          <ViewStack active={mode} views={{
            bezier: null,
            bspline: null,
            subdivision: <ParamSlider symbol="k" label="細分割の回数" value={levels} min={0} max={6} step={1} onChange={setLevels} format={(value) => value.toFixed(0)} />,
          }} reserve={['subdivision']} />
          <ControlGroup label="表示">
            <ToggleButton pressed={showPolygon} onChange={setShowPolygon}>制御点の折れ線</ToggleButton>
            <ToggleButton pressed={showHull} onChange={setShowHull} disabled={mode !== 'bezier'}>凸包</ToggleButton>
            <ToggleButton pressed={showCircle} onChange={setShowCircle}>曲率の円</ToggleButton>
          </ControlGroup>
        </>
      }
    />
  )
}
