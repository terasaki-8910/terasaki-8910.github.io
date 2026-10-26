import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView } from '../../visualization/axes'
import { arrowStep, clamp, drawText, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { drawSubLabel } from './labelKit'
import { edgeCrossing, marchingSquares } from '../../../utils/vis/isosurface'
import { clipToFrame, rampColor } from './isosurfaceKit'

const RADIUS = 0.72

function circleData(n) {
  const values = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -1 + 2 * i / (n - 1)
    const y = -1 + 2 * j / (n - 1)
    values[i + n * j] = RADIUS * RADIUS - (x * x + y * y)
  }
  const result = marchingSquares(values, n, n, 0)
  const points = result.segments.flat().map(([i, j]) => [-1 + 2 * i / (n - 1), -1 + 2 * j / (n - 1)])
  const error = points.reduce((largest, [x, y]) => Math.max(largest, Math.abs(Math.hypot(x, y) - RADIUS)), 0)
  return { values, points, error }
}

export default function IsosurfaceStep5() {
  const [values, setValues] = useState([-0.75, 0.55])
  const [grid, setGrid] = useState(8)
  const selectedRef = useRef(0)
  const crossing = edgeCrossing(values[0], values[1], 0)
  const hasCrossing = (values[0] >= 0) !== (values[1] >= 0)
  const circle = circleData(grid)

  const views = (width, height) => {
    const stacked = width < 520
    if (stacked) {
      const split = Math.round(height * 0.38)
      return {
        edge: makeView({ width, height, xRange: [-0.14, 1.14], yRange: [-1.05, 1.05], margin: { left: 40, right: 20, top: 16, bottom: height - split + 20 }, equal: false }),
        circle: makeView({ width, height, xRange: [-1.08, 1.08], yRange: [-1.08, 1.08], margin: { left: 40, right: 20, top: split + 18, bottom: 28 }, equal: true }),
      }
    }
    const split = Math.round(width * 0.43)
    return {
      edge: makeView({ width, height, xRange: [-0.14, 1.14], yRange: [-1.05, 1.05], margin: { left: 38, right: width - split + 18, top: 20, bottom: 34 }, equal: false }),
      circle: makeView({ width, height, xRange: [-1.08, 1.08], yRange: [-1.08, 1.08], margin: { left: split + 34, right: 20, top: 20, bottom: 34 }, equal: true }),
    }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { edge, circle: circleView } = views(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    clipToFrame(ctx, edge, () => {
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(edge.sx(0), edge.sy(0)); ctx.lineTo(edge.sx(1), edge.sy(0)); ctx.stroke()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.2
      ctx.beginPath(); ctx.moveTo(edge.sx(0), edge.sy(values[0])); ctx.lineTo(edge.sx(1), edge.sy(values[1])); ctx.stroke()
      values.forEach((value, index) => {
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(edge.sx(index), edge.sy(0)); ctx.lineTo(edge.sx(index), edge.sy(value)); ctx.stroke()
        markerCircle(ctx, edge.sx(index), edge.sy(value), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current === index ? 3 : 1.5 })
        drawSubLabel(ctx, `f_${index ? 'b' : 'a'} = ${fmt(value, 2)}`, edge.sx(index) + (index ? -9 : 9), edge.sy(value) - 10, { color: colors.ink, size: 11, align: index ? 'right' : 'left' })
      })
      if (hasCrossing) {
        markerCircle(ctx, edge.sx(crossing), edge.sy(0), 5, { fill: colors.ink, stroke: colors.surface, lineWidth: 1 })
        drawText(ctx, `t = ${crossing.toFixed(3)}`, edge.sx(crossing), edge.sy(0) + 13, { color: colors.ink, size: 11, align: 'center', baseline: 'top' })
      }
    })

    const n = grid
    clipToFrame(ctx, circleView, () => {
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const average = (circle.values[i + n * j] + circle.values[i + 1 + n * j] + circle.values[i + n * (j + 1)] + circle.values[i + 1 + n * (j + 1)]) / 4
        const x0 = -1 + 2 * i / (n - 1)
        const x1 = -1 + 2 * (i + 1) / (n - 1)
        const y0 = -1 + 2 * j / (n - 1)
        const y1 = -1 + 2 * (j + 1) / (n - 1)
        ctx.fillStyle = rampColor(colors, average, 0.55)
        ctx.fillRect(circleView.sx(x0), circleView.sy(y1), circleView.sx(x1) - circleView.sx(x0) + 0.5, circleView.sy(y0) - circleView.sy(y1) + 0.5)
      }
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      for (let k = 0; k < n; k++) {
        const q = -1 + 2 * k / (n - 1)
        ctx.beginPath(); ctx.moveTo(circleView.sx(q), circleView.sy(-1)); ctx.lineTo(circleView.sx(q), circleView.sy(1)); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(circleView.sx(-1), circleView.sy(q)); ctx.lineTo(circleView.sx(1), circleView.sy(q)); ctx.stroke()
      }
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.4
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.arc(circleView.sx(0), circleView.sy(0), RADIUS * circleView.scaleX, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([])
      circle.points.forEach(([x, y]) => markerCircle(ctx, circleView.sx(x), circleView.sy(y), 2.8, { fill: colors.accent, stroke: colors.ink, lineWidth: 0.8 }))
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [values, grid, redraw])
  const edgeView = () => views(sizeRef.current.width, sizeRef.current.height).edge
  const hit = (point) => {
    const view = edgeView()
    for (let index = 0; index < 2; index++) if (Math.hypot(point.x - view.sx(index), point.y - view.sy(values[index])) <= 18) return index
    return -1
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => hit(point) >= 0,
    onDown: (point) => { const index = hit(point); if (index < 0) return false; selectedRef.current = index; redraw(); return true },
    onMove: ({ y }) => setValues((current) => current.map((value, index) => index === selectedRef.current ? clamp(edgeView().wy(y), -1, 1) : value)),
    onUp: () => {},
  })
  const onKeyDown = (event) => {
    if (event.key === '1' || event.key === '2') { selectedRef.current = Number(event.key) - 1; redraw(); return }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setValues((current) => current.map((value, index) => index === selectedRef.current ? clamp(value + step.dy * 0.05, -1, 1) : value))
  }
  return (
    <SimShell
      label="辺の上の交点と円の近似"
      height={{ phone: [320, 400], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="上の端点の値を上下にドラッグできます。1、2 キーで端点を選び、上下キーでも値を変えられます。下は格子辺の交点と真の円です。" />}
      legend={<SimLegend items={[
        { key: 'line', label: '端の値を結ぶ直線', swatch: 'var(--color-ink)' },
        { key: 'true', label: '真の円', value: '破線', swatch: 'var(--color-ink)' },
        { key: 'crossings', label: '線形補間した交点', swatch: 'rgb(var(--color-accent))' },
        { key: 'error', label: '最大距離', value: circle.error.toFixed(5), minChars: 8 },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={() => { setValues([-0.75, 0.55]); setGrid(8); selectedRef.current = 0 }} /></SimToolbar>
        <ParamSlider symbol="N" label="格子数" value={grid} min={4} max={40} step={1} onChange={setGrid} />
      </>}
    />
  )
}
