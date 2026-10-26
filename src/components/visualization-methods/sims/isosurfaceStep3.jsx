import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes, makeView } from '../../visualization/axes'
import { arrowStep, clamp, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { marchingSquares, metaballField, metaballWeight } from '../../../utils/vis/isosurface'
import { clipToFrame, drawBallHandles, drawFieldCells, drawSegments, hitBall, makeIsoView } from './isosurfaceKit'

const INITIAL = [{ x: 1.05, y: 1.25, b: 1 }, { x: 2.05, y: 1.72, b: 1 }, { x: 3.05, y: 1.05, b: 1 }]

export default function IsosurfaceStep3() {
  const [balls, setBalls] = useState(INITIAL)
  const [threshold, setThreshold] = useState(0.28)
  const [radius, setRadius] = useState(0.95)
  const [lineY, setLineY] = useState(1.45)
  const selectedRef = useRef({ kind: 'ball', index: -1 })

  const views = (width, height) => {
    const split = Math.max(120, Math.round(height * 0.59))
    return {
      field: makeIsoView(width, split, { left: 42, right: 20, top: 16, bottom: 28 }),
      graph: makeView({ width, height, xRange: [0, 4], yRange: [0, 2.1], margin: { left: 42, right: 20, top: split + 20, bottom: 32 }, equal: false }),
    }
  }
  const activeBalls = balls.map((ball) => ({ ...ball, R: radius }))
  const draw = ({ ctx, width, height, colors }) => {
    const { field, graph } = views(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const n = 40
    const values = new Float64Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values[i + n * j] = metaballField([(4 * i) / (n - 1), (3 * j) / (n - 1)], activeBalls, threshold)
    const contour = marchingSquares(values, n, n, 0)
    clipToFrame(ctx, field, () => {
      drawFieldCells(ctx, field, colors, values, n, n, 0.55)
      drawSegments(ctx, field, contour.segments, n, n, colors.ink)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(field.sx(0), field.sy(lineY)); ctx.lineTo(field.sx(4), field.sy(lineY)); ctx.stroke(); ctx.setLineDash([])
      markerCircle(ctx, field.sx(3.85), field.sy(lineY), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current.kind === 'line' ? 3 : 1.5 })
      drawBallHandles(ctx, field, activeBalls, colors, selectedRef.current.kind === 'ball' ? selectedRef.current.index : -1)
    })
    drawAxes(ctx, field, { colors, xLabel: 'x', yLabel: 'y' })

    clipToFrame(ctx, graph, () => {
      activeBalls.forEach((ball, index) => {
        ctx.strokeStyle = laneColor(colors, index)
        ctx.lineWidth = 1.4
        ctx.beginPath()
        for (let sample = 0; sample <= 180; sample++) {
          const x = 4 * sample / 180
          const distance = Math.hypot(x - ball.x, lineY - ball.y)
          const value = metaballWeight(distance, radius)
          if (sample === 0) ctx.moveTo(graph.sx(x), graph.sy(value))
          else ctx.lineTo(graph.sx(x), graph.sy(value))
        }
        ctx.stroke()
      })
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let sample = 0; sample <= 180; sample++) {
        const x = 4 * sample / 180
        const sum = activeBalls.reduce((total, ball) => total + metaballWeight(Math.hypot(x - ball.x, lineY - ball.y), radius), 0)
        if (sample === 0) ctx.moveTo(graph.sx(x), graph.sy(sum))
        else ctx.lineTo(graph.sx(x), graph.sy(sum))
      }
      ctx.stroke()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.3
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(graph.sx(0), graph.sy(threshold)); ctx.lineTo(graph.sx(4), graph.sy(threshold)); ctx.stroke(); ctx.setLineDash([])
    })
    drawAxes(ctx, graph, { colors, xLabel: 'x', yLabel: 'W' })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [balls, threshold, radius, lineY, redraw])
  const currentViews = () => views(sizeRef.current.width, sizeRef.current.height)
  const hit = (point) => {
    const { field } = currentViews()
    const index = hitBall(field, activeBalls, point)
    if (index >= 0) return { kind: 'ball', index }
    if (Math.abs(point.y - field.sy(lineY)) <= 14 && point.x >= field.frame.left && point.x <= field.frame.right) return { kind: 'line', index: -1 }
    return null
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => { const target = hit(point); if (!target) return false; selectedRef.current = target; redraw(); return true },
    onMove: ({ x, y }) => {
      const { field } = currentViews()
      if (selectedRef.current.kind === 'line') setLineY(clamp(field.wy(y), 0, 3))
      else if (selectedRef.current.index >= 0) setBalls((current) => current.map((ball, index) => index === selectedRef.current.index ? { ...ball, x: clamp(field.wx(x), 0, 4), y: clamp(field.wy(y), 0, 3) } : ball))
    },
    onUp: () => {},
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedRef.current.kind === 'line') setLineY((value) => clamp(value + step.dy * 0.05, 0, 3))
    else {
      const index = selectedRef.current.index >= 0 ? selectedRef.current.index : 0
      setBalls((current) => current.map((ball, i) => i === index ? { ...ball, x: clamp(ball.x + step.dx * 0.05, 0, 4), y: clamp(ball.y + step.dy * 0.05, 0, 3) } : ball))
    }
  }
  return (
    <SimShell
      label="粒子から作るメタボール場"
      height={{ phone: [320, 400], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="3 個の粒子と水平な断面線をドラッグできます。矢印キーでも選んだ対象を動かせます。" />}
      legend={<SimLegend items={[
        { key: 'field', label: '場', value: '外 → 内', swatch: 'linear-gradient(90deg, var(--color-surface), var(--lane-1))' },
        { key: 'bumps', label: '各粒子の山', swatch: 'var(--lane-0)' },
        { key: 'sum', label: '山の合計', swatch: 'var(--color-ink)' },
        { key: 'threshold', symbol: 'T', label: 'しきい値', value: threshold.toFixed(2) },
        { key: 'line', symbol: 'y_c', label: '断面の高さ', value: lineY.toFixed(2) },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={() => { setBalls(INITIAL); setThreshold(0.28); setRadius(0.95); setLineY(1.45) }} /></SimToolbar>
        <ParamSlider symbol="T" label="しきい値" value={threshold} min={0.05} max={1} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <ParamSlider symbol="R" label="粒子の半径" value={radius} min={0.3} max={1.4} step={0.01} onChange={setRadius} format={(v) => v.toFixed(2)} />
      </>}
    />
  )
}
