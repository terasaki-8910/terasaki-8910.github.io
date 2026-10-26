import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import useSimLoop from '../../visualization/useSimLoop'
import { makeView, drawAxes } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { bsplinePoint, chaikin, uniformKnots } from '../../../utils/vis/curve'
import { drawControlPoints, drawPolyline, hitControlPoint, rangesForAspect, sampleCurve } from './shapeKit'

const INITIAL = [[0.45, 0.65], [1.3, 2.75], [2.35, 0.95], [3.5, 2.55], [4.75, 0.7], [5.9, 2.15]]
const KNOTS = uniformKnots(6, 2)
const END = 4
const copyInitial = () => INITIAL.map((point) => point.slice())

function sampledPolyline(points, perEdge = 10) {
  const result = []
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < perEdge; j++) {
      const t = j / perEdge
      result.push([
        points[i][0] * (1 - t) + points[i + 1][0] * t,
        points[i][1] * (1 - t) + points[i + 1][1] * t,
      ])
    }
  }
  if (points.length) result.push(points.at(-1))
  return result
}

export default function ShapeStep6() {
  const [points, setPoints] = useState(copyInitial)
  const [levels, setLevels] = useState(0)
  const [selected, setSelected] = useState(0)
  const dragging = useRef(null)
  const elapsed = useRef(0)
  const current = useMemo(() => chaikin(points, levels), [points, levels])
  const limit = useMemo(() => sampleCurve((u) => bsplinePoint(points, 2, KNOTS, u === 1 ? END - 1e-7 : u * END), 320), [points])
  const maxDistance = useMemo(() => sampledPolyline(current).reduce((maximum, point) => {
    const nearest = limit.reduce((best, sample) => Math.min(best, Math.hypot(point[0] - sample.point[0], point[1] - sample.point[1])), Infinity)
    return Math.max(maximum, nearest)
  }, 0), [current, limit])
  const viewOf = (width, height) => makeView({ width, height, ...rangesForAspect([0, 6.4], [0, 3.4], width, height), margin: STEP_MARGIN })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    drawPolyline(ctx, view, limit.map((sample) => sample.point), { color: colors.muted, width: 1.5, dash: [6, 4] })
    drawPolyline(ctx, view, current, { color: colors.ink, width: 2.25 })
    current.forEach(([x, y]) => markerCircle(ctx, view.sx(x), view.sy(y), 2.75, { fill: colors.ink }))
    drawControlPoints(ctx, view, points, colors, { selected })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const loop = useSimLoop((dt) => {
    elapsed.current += dt
    if (elapsed.current < 0.8) return
    elapsed.current %= 0.8
    setLevels((value) => value >= 6 ? 0 : value + 1)
  }, { targetRef: canvasRef })

  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const { width, height } = sizeRef.current
      return hitControlPoint(viewOf(width, height), points, position) >= 0
    },
    onDown: (position) => {
      const { width, height } = sizeRef.current
      const index = hitControlPoint(viewOf(width, height), points, position)
      if (index < 0) return false
      dragging.current = index
      setSelected(index)
    },
    onMove: (position) => {
      if (dragging.current === null) return
      const { width, height } = sizeRef.current
      const view = viewOf(width, height)
      const index = dragging.current
      setPoints((currentPoints) => currentPoints.map((point, i) => i === index
        ? [clamp(view.wx(position.x), 0, 6.4), clamp(view.wy(position.y), 0, 3.4)]
        : point))
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const direction = event.key === 'PageUp' ? 1 : -1
      setSelected((selected + direction + points.length) % points.length)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setPoints((currentPoints) => currentPoints.map((point, i) => i === selected
      ? [clamp(point[0] + step.dx * 0.1, 0, 6.4), clamp(point[1] + step.dy * 0.1, 0, 3.4)]
      : point))
  }
  const reset = () => {
    setPoints(copyInitial())
    setLevels(0)
    setSelected(0)
    elapsed.current = 0
  }

  return (
    <SimShell
      label="Chaikin の細分割"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="6 個の制御点を繰り返しかど切りした折れ線と、極限の 2 次 B スプライン。制御点をつかんで動かせる。矢印キーで選択中の点を動かし、PageUp と PageDown で点を選べる" />}
      legend={<SimLegend items={[
        { key: 'current', label: '現在の折れ線', swatch: 'var(--color-ink)' },
        { key: 'limit', label: '極限の B スプライン', swatch: 'var(--color-muted)' },
        { key: 'count', label: '点の数', value: String(current.length), minChars: 6 },
        { key: 'distance', label: '極限までの最大距離', value: fmt(maxDistance, 3), minChars: 8 },
      ]} />}
      controls={
        <>
          <SimToolbar><PlayPauseButton running={loop.running} onToggle={loop.toggle} /><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="k" label="細分割の回数" value={levels} min={0} max={6} step={1} onChange={(value) => { setLevels(value); elapsed.current = 0 }} format={(value) => value.toFixed(0)} />
        </>
      }
    />
  )
}
