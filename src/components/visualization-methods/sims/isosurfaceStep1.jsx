import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView } from '../../visualization/axes'
import { arrowStep, clamp, drawText, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { bilinear, trilinear } from '../../../utils/vis/isosurface'
import { rampColor } from './isosurfaceKit'

const INITIAL_VALUES = [-0.7, 0.65, 0.25, 0.95, -0.35, 0.85, 0.55, -0.6]

export default function IsosurfaceStep1() {
  const [mode, setMode] = useState('2d')
  const [values, setValues] = useState(INITIAL_VALUES)
  const [probe, setProbe] = useState([0.42, 0.58])
  const [depth, setDepth] = useState(0.45)
  const selectedRef = useRef({ kind: 'probe', index: -1 })

  const draw = ({ ctx, width, height, colors }) => {
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const view = makeView({ width, height, xRange: [-0.35, mode === '2d' ? 1.35 : 1.7], yRange: [-0.25, 1.65], margin: { left: 38, right: 24, top: 22, bottom: 34 }, equal: true })
    const project = (x, y, z = 0) => [view.sx(x + 0.34 * z), view.sy(y + 0.24 * z)]
    const faces = mode === '2d' ? [0] : [0, 1]
    for (const z of faces) {
      const resolution = 34
      for (let j = 0; j < resolution; j++) for (let i = 0; i < resolution; i++) {
        const a = (i + 0.5) / resolution
        const b = (j + 0.5) / resolution
        const offset = z ? 4 : 0
        const field = bilinear(values[offset], values[offset + 1], values[offset + 2], values[offset + 3], a, b)
        const p0 = project(i / resolution, j / resolution, z)
        const p1 = project((i + 1) / resolution, j / resolution, z)
        const p2 = project((i + 1) / resolution, (j + 1) / resolution, z)
        const p3 = project(i / resolution, (j + 1) / resolution, z)
        ctx.fillStyle = rampColor(colors, field, 1)
        ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.fill()
      }
    }
    const edge = (a, b) => { ctx.moveTo(...a); ctx.lineTo(...b) }
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    edge(project(0, 0, 0), project(1, 0, 0)); edge(project(1, 0, 0), project(1, 1, 0)); edge(project(1, 1, 0), project(0, 1, 0)); edge(project(0, 1, 0), project(0, 0, 0))
    if (mode === '3d') {
      edge(project(0, 0, 1), project(1, 0, 1)); edge(project(1, 0, 1), project(1, 1, 1)); edge(project(1, 1, 1), project(0, 1, 1)); edge(project(0, 1, 1), project(0, 0, 1))
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) edge(project(x, y, 0), project(x, y, 1))
    }
    ctx.stroke()

    const count = mode === '2d' ? 4 : 8
    const barTops = []
    for (let index = 0; index < count; index++) {
      const z = index >= 4 ? 1 : 0
      const local = index % 4
      const x = local % 2
      const y = local >= 2 ? 1 : 0
      const base = project(x, y, z)
      const top = [base[0], base[1] - values[index] * 34]
      barTops.push(top)
      ctx.strokeStyle = laneColor(colors, z ? 2 : 0)
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...top); ctx.stroke()
      markerCircle(ctx, top[0], top[1], 6, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current.index === index ? 3 : 1.5 })
      drawText(ctx, `f${index} = ${values[index].toFixed(2)}`, top[0] + 9, top[1] - 5, { color: colors.ink, size: 11 })
    }
    ctx.lineWidth = 1.5
    for (const [left, right, color] of [[0, 1, 2], [2, 3, 2], [4, 5, 3], [6, 7, 3]]) {
      if (right >= count) continue
      ctx.strokeStyle = laneColor(colors, color)
      ctx.beginPath(); ctx.moveTo(...barTops[left]); ctx.lineTo(...barTops[right]); ctx.stroke()
    }

    const [a, b] = probe
    const z = mode === '3d' ? depth : 0
    const frontA = bilinear(values[0], values[1], values[2], values[3], a, 0)
    const frontB = bilinear(values[0], values[1], values[2], values[3], a, 1)
    const backA = bilinear(values[4], values[5], values[6], values[7], a, 0)
    const backB = bilinear(values[4], values[5], values[6], values[7], a, 1)
    const drawInterpolation = (p, value, color, label) => {
      const q = [p[0], p[1] - value * 34]
      ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.setLineDash([])
      markerCircle(ctx, q[0], q[1], 3.5, { fill: color, stroke: colors.ink, lineWidth: 0.8 })
      if (label) drawText(ctx, label, q[0] + 7, q[1], { color: colors.ink, size: 11 })
      return q
    }
    const pA = drawInterpolation(project(a, 0, 0), frontA, laneColor(colors, 2), 'f_A')
    const pB = drawInterpolation(project(a, 1, 0), frontB, laneColor(colors, 2), 'f_B')
    ctx.strokeStyle = laneColor(colors, 2); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...pA); ctx.lineTo(...pB); ctx.stroke()
    if (mode === '3d') {
      const pC = drawInterpolation(project(a, 0, 1), backA, laneColor(colors, 3), '')
      const pD = drawInterpolation(project(a, 1, 1), backB, laneColor(colors, 3), '')
      ctx.strokeStyle = laneColor(colors, 3); ctx.beginPath(); ctx.moveTo(...pC); ctx.lineTo(...pD); ctx.stroke()
      const front = bilinear(values[0], values[1], values[2], values[3], a, b)
      const back = bilinear(values[4], values[5], values[6], values[7], a, b)
      const u = drawInterpolation(project(a, b, 0), front, laneColor(colors, 0), 'f_C')
      const v = drawInterpolation(project(a, b, 1), back, laneColor(colors, 1), 'f_D')
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(...u); ctx.lineTo(...v); ctx.stroke()
    }
    const f = mode === '2d' ? bilinear(values[0], values[1], values[2], values[3], a, b) : trilinear(values, a, b, depth)
    const pp = project(a, b, z)
    markerCircle(ctx, pp[0], pp[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current.kind === 'probe' ? 3 : 1.5 })
    drawText(ctx, `f = ${f.toFixed(3)}`, pp[0] + 12, pp[1] - 12, { color: colors.ink, size: 12 })
    drawText(ctx, 'x', view.sx(1.2), view.sy(-0.02), { color: colors.ink, size: 12 })
    drawText(ctx, 'y', view.sx(-0.03), view.sy(1.22), { color: colors.ink, size: 12 })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [mode, values, probe, depth, redraw])

  const geometry = () => {
    const { width, height } = sizeRef.current
    const view = makeView({ width, height, xRange: [-0.35, mode === '2d' ? 1.35 : 1.7], yRange: [-0.25, 1.65], margin: { left: 38, right: 24, top: 22, bottom: 34 }, equal: true })
    return { view, project: (x, y, z = 0) => [view.sx(x + 0.34 * z), view.sy(y + 0.24 * z)] }
  }
  const hit = (point) => {
    const { project } = geometry()
    const count = mode === '2d' ? 4 : 8
    for (let index = 0; index < count; index++) {
      const local = index % 4
      const base = project(local % 2, local >= 2 ? 1 : 0, index >= 4 ? 1 : 0)
      if (Math.hypot(point.x - base[0], point.y - (base[1] - values[index] * 34)) < 18) return { kind: 'value', index }
    }
    const p = project(probe[0], probe[1], mode === '3d' ? depth : 0)
    return Math.hypot(point.x - p[0], point.y - p[1]) < 20 ? { kind: 'probe', index: -1 } : null
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => { const target = hit(point); if (!target) return false; selectedRef.current = target; redraw(); return true },
    onMove: ({ x, y, dy }) => {
      if (selectedRef.current.kind === 'value') {
        setValues((current) => current.map((value, index) => index === selectedRef.current.index ? clamp(value - dy / 34, -1, 1) : value))
      } else {
        const { view } = geometry()
        setProbe([clamp(view.wx(x) - (mode === '3d' ? 0.34 * depth : 0), 0, 1), clamp(view.wy(y) - (mode === '3d' ? 0.24 * depth : 0), 0, 1)])
      }
    },
    onUp: () => {},
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedRef.current.kind === 'value' && selectedRef.current.index >= 0) {
      setValues((current) => current.map((value, index) => index === selectedRef.current.index ? clamp(value + step.dy * 0.05, -1, 1) : value))
    } else setProbe(([x, y]) => [clamp(x + step.dx * 0.02, 0, 1), clamp(y + step.dy * 0.02, 0, 1)])
  }
  const value = mode === '2d' ? bilinear(values[0], values[1], values[2], values[3], probe[0], probe[1]) : trilinear(values, probe[0], probe[1], depth)

  return (
    <SimShell
      label="格子内の線形補間"
      switcher={<ModeSwitch label="次元" value={mode} options={[{ value: '2d', label: '2 次元' }, { value: '3d', label: '3 次元' }]} onChange={setMode} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="角の縦棒を上下にドラッグして値を変え、点をドラッグまたは矢印キーで動かせます。" />}
      legend={<SimLegend items={[
        { key: 'front', label: '手前の補間', swatch: 'var(--lane-0)' },
        { key: 'back', label: '奥の補間', swatch: 'var(--lane-3)' },
        { key: 'value', symbol: 'f', label: '点の値', value: value.toFixed(3), minChars: 7 },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={() => { setValues(INITIAL_VALUES); setProbe([0.42, 0.58]); setDepth(0.45) }} /></SimToolbar>
        {mode === '3d' && <ParamSlider symbol="\gamma" label="点の奥行き" value={depth} min={0} max={1} step={0.01} onChange={setDepth} format={(v) => v.toFixed(2)} />}
      </>}
    />
  )
}
