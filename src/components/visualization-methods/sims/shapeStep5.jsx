import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { SimToolbar, ResetButton, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, laneColor, markerCircle, drawText } from '../../visualization/sims/rigidKit'
import { bezierPoint, bsplineBasis, bsplinePoint, uniformKnots } from '../../../utils/vis/curve'
import { drawControlPoints, drawPolyline, hitControlPoint, rangesForAspect } from './shapeKit'

const INITIAL = [[0.5, 0.8], [1.35, 2.65], [2.25, 2.25], [3.2, 0.75], [4.2, 1.25], [5.2, 2.7], [6.35, 1.1]]
const KNOTS = uniformKnots(7, 3)
const END = 4
const safeT = (t) => t === END ? END - 1e-7 : t
const copyInitial = () => INITIAL.map((point) => point.slice())

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

export default function ShapeStep5() {
  const [points, setPoints] = useState(copyInitial)
  const [selected, setSelected] = useState(2)
  const [compare, setCompare] = useState(false)
  const dragging = useRef(null)
  const support = [Math.max(0, KNOTS[selected]), Math.min(END, KNOTS[selected + 4])]
  const curve = useMemo(() => Array.from({ length: 281 }, (_, i) => {
    const t = END * i / 280
    return [t, bsplinePoint(points, 3, KNOTS, safeT(t))]
  }), [points])
  const bezier = useMemo(() => Array.from({ length: 281 }, (_, i) => bezierPoint(points, i / 280)), [points])

  const viewsOf = (width, height) => {
    if (width >= height * 1.6) {
      const split = Math.min(width * 0.68, Math.max(180, width * 0.57))
      const geometry = makeView({ width: split, height, ...rangesForAspect([0, 7], [0, 3.4], split, height), margin: STEP_MARGIN })
      const graphBase = makeView({ width: width - split, height, xRange: [0, END], yRange: [0, 1], equal: false, margin: STEP_MARGIN })
      return { geometry, graph: offsetXView(graphBase, split), split, sideBySide: true }
    }
    const split = Math.max(150, Math.min(height * 0.64, height - 105))
    const geometry = makeView({ width, height: split, ...rangesForAspect([0, 7], [0, 3.4], width, split), margin: STEP_MARGIN })
    const graphBase = makeView({ width, height: height - split, xRange: [0, END], yRange: [0, 1], equal: false, margin: STEP_MARGIN })
    return { geometry, graph: offsetYView(graphBase, split), split, sideBySide: false }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { geometry, graph, split, sideBySide } = viewsOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, geometry, { colors, xLabel: 'x', yLabel: 'y' })
    ctx.strokeStyle = colors.line
    ctx.lineWidth = 1
    ctx.beginPath()
    if (sideBySide) {
      ctx.moveTo(split, 14)
      ctx.lineTo(split, height - 14)
    } else {
      ctx.moveTo(14, split)
      ctx.lineTo(width - 14, split)
    }
    ctx.stroke()

    drawPolyline(ctx, geometry, points, { color: colors.muted, width: 1.25, dash: [5, 4] })
    if (compare) drawPolyline(ctx, geometry, bezier, { color: laneColor(colors, 4), width: 1.5, dash: [6, 4] })
    drawPolyline(ctx, geometry, curve.map((entry) => entry[1]), { color: colors.ink, width: 2.25 })
    const affected = curve.filter(([t]) => t >= support[0] && t <= support[1]).map((entry) => entry[1])
    drawPolyline(ctx, geometry, affected, { color: laneColor(colors, selected % 5), width: 3.5 })
    drawControlPoints(ctx, geometry, points, colors, { selected })

    ctx.strokeStyle = colors.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(graph.frame.left, graph.frame.bottom)
    ctx.lineTo(graph.frame.right, graph.frame.bottom)
    ctx.moveTo(graph.frame.left, graph.frame.bottom)
    ctx.lineTo(graph.frame.left, graph.frame.top)
    ctx.stroke()
    ;[0, 1, 2, 3, 4].forEach((tick) => {
      ctx.beginPath()
      ctx.moveTo(graph.sx(tick), graph.frame.bottom)
      ctx.lineTo(graph.sx(tick), graph.frame.bottom + 4)
      ctx.stroke()
      drawText(ctx, String(tick), graph.sx(tick), graph.frame.bottom + 14, { color: colors.muted, align: 'center' })
    })
    ;[0, 0.5, 1].forEach((tick) => {
      ctx.beginPath()
      ctx.moveTo(graph.frame.left - 4, graph.sy(tick))
      ctx.lineTo(graph.frame.left, graph.sy(tick))
      ctx.stroke()
      drawText(ctx, String(tick), graph.frame.left - 7, graph.sy(tick), { color: colors.muted, align: 'right', baseline: 'middle' })
    })
    drawText(ctx, 't', graph.frame.right, graph.frame.bottom + 16, { color: colors.ink, align: 'right' })
    drawText(ctx, 'N', graph.frame.left, graph.frame.top - 8, { color: colors.ink, align: 'left', baseline: 'bottom' })
    for (let basisIndex = 0; basisIndex < 7; basisIndex++) {
      const values = Array.from({ length: 161 }, (_, i) => {
        const t = END * i / 160
        return [t, bsplineBasis(basisIndex, 3, safeT(t), KNOTS)]
      })
      drawPolyline(ctx, graph, values, {
        color: basisIndex === selected ? laneColor(colors, selected % 5) : colors.muted,
        width: basisIndex === selected ? 3 : 1.25,
      })
    }
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const { width, height } = sizeRef.current
      return hitControlPoint(viewsOf(width, height).geometry, points, position) >= 0
    },
    onDown: (position) => {
      const { width, height } = sizeRef.current
      const index = hitControlPoint(viewsOf(width, height).geometry, points, position)
      if (index < 0) return false
      dragging.current = index
      setSelected(index)
    },
    onMove: (position) => {
      if (dragging.current === null) return
      const { width, height } = sizeRef.current
      const view = viewsOf(width, height).geometry
      const index = dragging.current
      setPoints((current) => current.map((point, i) => i === index
        ? [clamp(view.wx(position.x), 0, 7), clamp(view.wy(position.y), 0, 3.4)]
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
    setPoints((current) => current.map((point, i) => i === selected
      ? [clamp(point[0] + step.dx * 0.1, 0, 7), clamp(point[1] + step.dy * 0.1, 0, 3.4)]
      : point))
  }
  const reset = () => {
    setPoints(copyInitial())
    setSelected(2)
    setCompare(false)
  }

  return (
    <SimShell
      label="一様 3 次 B スプライン"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="7 個の制御点で作る一様 3 次 B スプラインと、その下の基底関数。制御点をつかんで動かせる。矢印キーで選択中の点を動かし、PageUp と PageDown で点を選べる" />}
      legend={<SimLegend items={[
        { key: 'curve', label: 'B スプライン', swatch: 'var(--color-ink)' },
        { key: 'basis', symbol: `N_${selected}^3`, label: `P${selected} の重み`, swatch: `var(--lane-${selected % 5})` },
        { key: 'support', label: '変わる区間', value: `[${support[0]}, ${support[1]})`, minChars: 10 },
        ...(compare ? [{ key: 'bezier', label: '6 次ベジエ', swatch: 'var(--lane-4)' }] : []),
      ]} />}
      controls={<SimToolbar label="表示"><ToggleButton pressed={compare} onChange={setCompare}>ベジエと比べる</ToggleButton><ResetButton onClick={reset} /></SimToolbar>}
    />
  )
}
