import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { emissionAbsorption, transmittance } from '../../../utils/vis/volume'
import { clamp, markerCircle } from '../../visualization/sims/rigidKit'

const COUNT = 8

export default function VolumeStep2() {
  const [sigma, setSigma] = useState(() => Array.from({ length: COUNT }, (_, i) => 0.25 + 0.55 * Math.sin((i + 1) * 0.7) ** 2))
  const [emission, setEmission] = useState(() => Array.from({ length: COUNT }, (_, i) => 0.16 + 0.72 * Math.exp(-((i - 4) ** 2) / 5)))
  const [selected, setSelected] = useState({ kind: 'emission', index: 4 })
  const stateRef = useRef({ sigma, emission, selected })
  stateRef.current = { sigma, emission, selected }
  const background = 0.3
  const ds = 1 / COUNT
  const total = emissionAbsorption(sigma.slice().reverse(), emission.slice().reverse(), ds, background)
  const backgroundPart = transmittance(sigma, ds) * background
  const map = (width, height) => ({ x: (i) => 46 + (i + 0.5) / COUNT * (width - 68), y: (v) => height * 0.58 - v * height * 0.36 })
  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current; const view = map(width, height)
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(46, height * 0.58); ctx.lineTo(width - 22, height * 0.58); ctx.stroke()
    const contribution = state.sigma.map((s, i) => {
      const front = transmittance(state.sigma.slice(i + 1), ds)
      return front * emissionAbsorption([s], [state.emission[i]], ds, 0)
    })
    state.sigma.forEach((value, i) => {
      const x = view.x(i)
      ctx.strokeStyle = colors.alpha('lane-0', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, view.y(0)); ctx.lineTo(x, view.y(value)); ctx.stroke()
      markerCircle(ctx, x - 5, view.y(value), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: state.selected.kind === 'sigma' && state.selected.index === i ? 3 : 1 })
      ctx.strokeStyle = colors.alpha('lane-3', 1); ctx.beginPath(); ctx.moveTo(x + 5, view.y(0)); ctx.lineTo(x + 5, view.y(state.emission[i])); ctx.stroke()
      markerCircle(ctx, x + 5, view.y(state.emission[i]), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: state.selected.kind === 'emission' && state.selected.index === i ? 3 : 1 })
      ctx.fillStyle = colors.alpha('lane-1', 0.7); const h = contribution[i] * height * 0.7; ctx.fillRect(x - 7, height * 0.87 - h, 14, h)
    })
    ctx.fillStyle = colors.muted; ctx.font = '12px sans-serif'; ctx.fillText('σ', 15, height * 0.23); ctx.fillText('Lₑ', 15, height * 0.31); ctx.fillText('各点の寄与', 15, height * 0.78)
    const barX = 46; const barY = height - 20; const barW = width - 68
    ctx.fillStyle = colors.alpha('lane-3', 0.75); ctx.fillRect(barX, barY, barW * Math.max(0, total - backgroundPart), 10)
    ctx.fillStyle = colors.alpha('lane-0', 0.75); ctx.fillRect(barX + barW * Math.max(0, total - backgroundPart), barY, barW * backgroundPart, 10)
    ctx.fillStyle = colors.ink; ctx.font = '15px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('目', width - 5, height * 0.56)
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [sigma, emission, selected])
  const hit = (p) => {
    const view = map(sizeRef.current.width, sizeRef.current.height)
    let result = null; let best = 18
    ;['sigma', 'emission'].forEach((kind) => stateRef.current[kind].forEach((value, i) => {
      const d = Math.hypot(p.x - (view.x(i) + (kind === 'sigma' ? -5 : 5)), p.y - view.y(value))
      if (d < best) { best = d; result = { kind, index: i } }
    }))
    return result
  }
  const move = (target, p) => {
    const value = clamp((sizeRef.current.height * 0.58 - p.y) / (sizeRef.current.height * 0.36), 0.02, 1)
    const setter = target.kind === 'sigma' ? setSigma : setEmission
    setter((data) => data.map((v, i) => i === target.index ? value : v))
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => Boolean(hit(p)),
    onDown: (p) => { const target = hit(p); if (!target) return false; setSelected(target); move(target, p); return true },
    onMove: (p) => move(stateRef.current.selected, p),
  })
  const onKeyDown = (event) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSelected((value) => ({ ...value, index: clamp(value.index + (event.key === 'ArrowRight' ? 1 : -1), 0, COUNT - 1) }))
    else {
      const setter = selected.kind === 'sigma' ? setSigma : setEmission
      setter((data) => data.map((v, i) => i === selected.index ? clamp(v + (event.key === 'ArrowUp' ? 0.04 : -0.04), 0.02, 1) : v))
    }
  }
  return <SimShell label="発光と吸収" stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="煙の吸収率と発光量。丸をドラッグ、矢印キーで調整" />} legend={<SimLegend items={[
    { key: 'total', symbol: 'L', label: '届く光', value: total.toFixed(3) },
    { key: 'emission', label: '発光の分', value: (total - backgroundPart).toFixed(3), swatch: 'var(--lane-3)' },
    { key: 'background', label: '背景の分', value: backgroundPart.toFixed(3), swatch: 'var(--lane-0)' },
  ]} />} />
}
