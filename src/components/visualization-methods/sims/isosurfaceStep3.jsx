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
import { clipToFrame, cycleIndex, drawBallHandles, drawFieldCells, drawSegments, hitBall, makeIsoView, pageStep } from './isosurfaceKit'

const INITIAL = [{ x: 1.05, y: 1.25, b: 1 }, { x: 2.05, y: 1.72, b: 1 }, { x: 3.05, y: 1.05, b: 1 }]
const LINE = INITIAL.length // 選べる物のうち、粒子(0〜2)ではなく断面線

export default function IsosurfaceStep3() {
  const [balls, setBalls] = useState(INITIAL)
  const [threshold, setThreshold] = useState(0.28)
  const [radius, setRadius] = useState(0.95)
  const [lineY, setLineY] = useState(1.45)
  const [selected, setSelected] = useState(0) // 選んでいる物: 0〜2 は粒子、LINE は断面線
  const grabRef = useRef(-1) // ドラッグでつかんでいる物(粒子の番号か LINE。なければ -1)

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
      ctx.save()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(field.sx(0), field.sy(lineY)); ctx.lineTo(field.sx(4), field.sy(lineY)); ctx.stroke()
      ctx.restore()
      markerCircle(ctx, field.sx(3.85), field.sy(lineY), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: selected === LINE ? 3 : 1.5 })
      drawBallHandles(ctx, field, activeBalls, colors, selected)
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
      ctx.save()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.3
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(graph.sx(0), graph.sy(threshold)); ctx.lineTo(graph.sx(4), graph.sy(threshold)); ctx.stroke()
      ctx.restore()
    })
    drawAxes(ctx, graph, { colors, xLabel: 'x', yLabel: 'W' })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [balls, threshold, radius, lineY, selected, redraw])
  const currentViews = () => views(sizeRef.current.width, sizeRef.current.height)
  const hit = (point) => {
    const { field } = currentViews()
    const index = hitBall(field, activeBalls, point)
    if (index >= 0) return index
    if (Math.abs(point.y - field.sy(lineY)) <= 14 && point.x >= field.frame.left && point.x <= field.frame.right) return LINE
    return -1
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => hit(point) >= 0,
    onDown: (point) => {
      const target = hit(point)
      if (target < 0) return false
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      grabRef.current = target
      setSelected(target)
      return true
    },
    onMove: ({ x, y }) => {
      const target = grabRef.current
      const { field } = currentViews()
      if (target === LINE) setLineY(clamp(field.wy(y), 0, 3))
      else if (target >= 0) setBalls((current) => current.map((ball, index) => index === target ? { ...ball, x: clamp(field.wx(x), 0, 4), y: clamp(field.wy(y), 0, 3) } : ball))
    },
    onUp: () => { grabRef.current = -1 },
  })
  // PageUp・PageDown で、粒子 3 個と断面線を順に選ぶ。矢印キーで選んだ物を動かす(断面線は上下だけ)
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const page = pageStep(event)
    if (page) {
      event.preventDefault()
      setSelected(cycleIndex(selected, page, INITIAL.length + 1))
      return
    }
    const step = arrowStep(event)
    if (!step) return
    if (selected === LINE) {
      if (step.dy === 0) return
      event.preventDefault()
      setLineY((value) => clamp(value + step.dy * 0.05, 0, 3))
    } else {
      event.preventDefault()
      setBalls((current) => current.map((ball, i) => i === selected ? { ...ball, x: clamp(ball.x + step.dx * 0.05, 0, 4), y: clamp(ball.y + step.dy * 0.05, 0, 3) } : ball))
    }
  }
  const selectedName = selected === LINE ? '断面線' : `粒子 ${selected + 1}`
  return (
    <SimShell
      label="粒子から作るメタボール場"
      height={{ phone: [320, 400], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label={`3 個の粒子が作る場と等値線、水平な断面線、その線上での各粒子の山と合計のグラフの絵。粒子と断面線の端の丸をドラッグで動かせます。PageUp・PageDown で粒子か断面線を選び、矢印キーで動かします（断面線は上下だけ。Shift で大きく）。選択中は${selectedName}。`} />}
      legend={<SimLegend items={[
        { key: 'field', label: '場', value: '外 → 内', swatch: 'linear-gradient(90deg, var(--color-surface), var(--lane-1))' },
        { key: 'bumps', label: '各粒子の山', swatch: 'linear-gradient(90deg, var(--lane-0) 33.3%, var(--lane-1) 33.3% 66.6%, var(--lane-2) 66.6%)' },
        { key: 'sum', label: '山の合計', swatch: 'var(--color-ink)' },
        { key: 'threshold', symbol: 'T', label: 'しきい値', value: threshold.toFixed(2) },
        { key: 'line', symbol: 'y_c', label: '断面の高さ', value: lineY.toFixed(2) },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={() => { setBalls(INITIAL); setThreshold(0.28); setRadius(0.95); setLineY(1.45); setSelected(0) }} /></SimToolbar>
        <ParamSlider symbol="T" label="しきい値" value={threshold} min={0.05} max={1} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <ParamSlider symbol="R" label="粒子の半径" value={radius} min={0.3} max={1.4} step={0.01} onChange={setRadius} format={(v) => v.toFixed(2)} />
      </>}
    />
  )
}
