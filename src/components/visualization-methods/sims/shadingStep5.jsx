import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { beckmannD, blinnPhongSpecular, cookTorranceSpecular, fresnelSchlick, geometryG, halfVector } from '../../../utils/vis/shading'
import { dot, normalize } from '../../../utils/vis/vec3'
import { directionFromAngle } from './shadingKit'

const INITIAL = { light: -34 * Math.PI / 180, view: 32 * Math.PI / 180, m: 0.28, F0: 0.06 }
const FACET_COUNT = 25

const randomSlopes = (() => {
  let seed = 8910
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: FACET_COUNT }, () => (random() + random() + random() - 1.5) / 0.75)
})()

function layout(width, height) {
  const gap = 18
  if (width >= 540) {
    const leftWidth = Math.floor(width * 0.46)
    return {
      surface: { left: 10, top: 10, width: leftWidth - 15, height: height - 20 },
      graph: { left: leftWidth + gap, top: 24, width: width - leftWidth - gap - 14, height: height - 54 },
    }
  }
  const split = Math.floor(height * 0.52)
  return {
    surface: { left: 10, top: 6, width: width - 20, height: split - 8 },
    graph: { left: 42, top: split + 12, width: width - 58, height: height - split - 40 },
  }
}

function handlePoint(rect, angle) {
  const radius = Math.min(rect.width * 0.3, rect.height * 0.34, 72)
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height * 0.53
  return [cx + Math.sin(angle) * radius, cy - Math.cos(angle) * radius]
}

function drawHandle(ctx, rect, angle, label, color, colors) {
  const [x, y] = handlePoint(rect, angle)
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height * 0.53
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x, y)
  ctx.stroke()
  markerCircle(ctx, x, y, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })
  drawText(ctx, label, x + (x < cx ? -10 : 10), y - 7, { color: colors.ink, align: x < cx ? 'right' : 'left' })
}

export default function ShadingStep5() {
  const [lightAngle, setLightAngle] = useState(INITIAL.light)
  const [viewAngle, setViewAngle] = useState(INITIAL.view)
  const [m, setM] = useState(INITIAL.m)
  const [F0, setF0] = useState(INITIAL.F0)
  const selected = useRef('light')
  const N = [0, 1, 0]
  const L = directionFromAngle(lightAngle)
  const V = directionFromAngle(viewAngle)
  const H = halfVector(L, V)
  const D = beckmannD(dot(N, H), m)
  const G = geometryG(N, L, V, H)
  const F = fresnelSchlick(F0, dot(V, H))
  const specular = cookTorranceSpecular(N, L, V, m, F0)
  const blinn = blinnPhongSpecular(N, L, V, Math.max(2, 2 / (m * m)))

  const draw = ({ ctx, width, height, colors }) => {
    const panes = layout(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    const rect = panes.surface
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.clip()
    drawText(ctx, '微小面', rect.left + 4, rect.top + 13, { color: colors.ink })
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height * 0.53
    ctx.strokeStyle = colors.line
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx, rect.top + 18)
    ctx.stroke()
    ctx.setLineDash([])
    drawText(ctx, 'N', cx + 7, rect.top + 28, { color: colors.ink })
    drawHandle(ctx, rect, lightAngle, 'L', laneColor(colors, 0), colors)
    drawHandle(ctx, rect, viewAngle, 'V', laneColor(colors, 2), colors)

    const startX = rect.left + 8
    const endX = rect.left + rect.width - 8
    const baseY = rect.top + rect.height * 0.77
    const dx = (endX - startX) / FACET_COUNT
    const rawY = [0]
    for (let i = 0; i < FACET_COUNT; i++) rawY.push(rawY[i] + randomSlopes[i] * m * dx * 0.65)
    const drift = rawY[FACET_COUNT] / FACET_COUNT
    const points = rawY.map((y, i) => [startX + i * dx, baseY + y - drift * i])
    for (let i = 0; i < FACET_COUNT; i++) {
      const slope = -(points[i + 1][1] - points[i][1]) / dx
      const normal = normalize([-slope, 1, 0])
      const aligned = dot(normal, H) >= Math.cos(8 * Math.PI / 180)
      ctx.strokeStyle = aligned ? laneColor(colors, 1) : colors.ink
      ctx.lineWidth = aligned ? 4 : 2
      ctx.beginPath()
      ctx.moveTo(points[i][0], points[i][1])
      ctx.lineTo(points[i + 1][0], points[i + 1][1])
      ctx.stroke()
      if (aligned) {
        const mx = (points[i][0] + points[i + 1][0]) / 2
        const my = (points[i][1] + points[i + 1][1]) / 2
        ctx.strokeStyle = colors.muted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(mx, my)
        ctx.lineTo(mx + normal[0] * 18, my - normal[1] * 18)
        ctx.stroke()
      }
    }
    drawText(ctx, 'H を向く面', rect.left + 4, rect.top + rect.height - 7, { color: laneColor(colors, 1) })
    ctx.restore()

    const graph = panes.graph
    const values = []
    let maxD = 0
    let maxSpec = 0
    for (let i = 0; i <= 90; i++) {
      const sampleV = directionFromAngle(i * Math.PI / 180)
      const sampleH = halfVector(L, sampleV)
      const sampleD = beckmannD(dot(N, sampleH), m)
      const sampleG = geometryG(N, L, sampleV, sampleH)
      const sampleF = fresnelSchlick(F0, dot(sampleV, sampleH))
      const sampleSpec = cookTorranceSpecular(N, L, sampleV, m, F0)
      const blinn = blinnPhongSpecular(N, L, sampleV, Math.max(2, 2 / (m * m)))
      values.push([sampleD, sampleG, sampleF, sampleSpec, blinn])
      maxD = Math.max(maxD, sampleD)
      maxSpec = Math.max(maxSpec, sampleSpec, blinn)
    }
    ctx.strokeStyle = colors.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(graph.left, graph.top)
    ctx.lineTo(graph.left, graph.top + graph.height)
    ctx.lineTo(graph.left + graph.width, graph.top + graph.height)
    ctx.stroke()
    ;[0, 30, 60, 90].forEach((degree) => {
      const x = graph.left + graph.width * degree / 90
      ctx.beginPath()
      ctx.moveTo(x, graph.top + graph.height)
      ctx.lineTo(x, graph.top + graph.height + 4)
      ctx.stroke()
      drawText(ctx, `${degree}°`, x, graph.top + graph.height + 15, { color: colors.muted, align: 'center' })
    })
    ;[0, 0.5, 1].forEach((tick) => {
      const y = graph.top + graph.height * (1 - tick)
      ctx.beginPath()
      ctx.moveTo(graph.left - 4, y)
      ctx.lineTo(graph.left, y)
      ctx.stroke()
      drawText(ctx, String(tick), graph.left - 7, y, { color: colors.muted, align: 'right', baseline: 'middle' })
    })
    const series = [
      { index: 0, color: laneColor(colors, 0), scale: maxD || 1 },
      { index: 1, color: laneColor(colors, 2), scale: 1 },
      { index: 2, color: colors.muted, scale: 1 },
      { index: 3, color: colors.ink, scale: maxSpec || 1 },
      { index: 4, color: colors.line, scale: maxSpec || 1, dash: [5, 4] },
    ]
    series.forEach(({ index, color, scale, dash }) => {
      ctx.strokeStyle = color
      ctx.lineWidth = index >= 3 ? 2 : 1.5
      ctx.setLineDash(dash ?? [])
      ctx.beginPath()
      values.forEach((sample, i) => {
        const x = graph.left + graph.width * i / 90
        const y = graph.top + graph.height * (1 - clamp(sample[index] / scale, 0, 1))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    })
    ctx.setLineDash([])
    drawText(ctx, '目の角度', graph.left + graph.width, graph.top + graph.height + 29, { color: colors.ink, align: 'right' })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const hit = (point) => {
    const rect = layout(sizeRef.current.width, sizeRef.current.height).surface
    const lp = handlePoint(rect, lightAngle)
    const vp = handlePoint(rect, viewAngle)
    if (Math.hypot(point.x - lp[0], point.y - lp[1]) <= 20) return 'light'
    if (Math.hypot(point.x - vp[0], point.y - vp[1]) <= 20) return 'view'
    return null
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => {
      const handle = hit(point)
      if (!handle) return false
      selected.current = handle
    },
    onMove: (point) => {
      const rect = layout(sizeRef.current.width, sizeRef.current.height).surface
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height * 0.53
      const angle = clamp(Math.atan2(point.x - cx, cy - point.y), -Math.PI / 2, Math.PI / 2)
      if (selected.current === 'light') setLightAngle(angle)
      else setViewAngle(angle)
    },
  })
  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      selected.current = selected.current === 'light' ? 'view' : 'light'
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const update = selected.current === 'light' ? setLightAngle : setViewAngle
    update((value) => clamp(value + step.dx * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
  }
  const reset = () => {
    setLightAngle(INITIAL.light)
    setViewAngle(INITIAL.view)
    setM(INITIAL.m)
    setF0(INITIAL.F0)
    selected.current = 'light'
  }

  return (
    <SimShell
      label="クック-トランスの微小面"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="粗い面の微小面と、角度に対するD、G、F、クック-トランスとブリン-フォンのつやを描いています。LまたはVをドラッグし、矢印キーで選択中の向きを動かせます。PageUpとPageDownで操作対象を切り替えます。" />}
      legend={<SimLegend items={[
        { key: 'D', symbol: 'D', label: '微小面分布', value: fmt(D, 3), swatch: 'var(--lane-0)', minChars: 7 },
        { key: 'G', symbol: 'G', label: '幾何減衰', value: fmt(G, 3), swatch: 'var(--lane-2)', minChars: 6 },
        { key: 'F', symbol: 'F', label: 'フレネル', value: fmt(F, 3), swatch: 'var(--color-muted)', minChars: 6 },
        { key: 'specular', symbol: 'R_s', label: '鏡面反射', value: fmt(specular, 3), swatch: 'var(--color-ink)', minChars: 7 },
        { key: 'blinn', label: 'ブリン-フォン', value: fmt(blinn, 3), swatch: 'var(--color-line)', minChars: 7 },
      ]} />}
      controls={<><SimToolbar><ResetButton onClick={reset} /></SimToolbar><ParamSlider symbol="m" label="粗さ" value={m} min={0.05} max={0.8} step={0.01} onChange={setM} format={(v) => v.toFixed(2)} /><ParamSlider symbol="F_0" label="正面反射率" value={F0} min={0.02} max={1} step={0.01} onChange={setF0} format={(v) => v.toFixed(2)} /></>}
    />
  )
}
