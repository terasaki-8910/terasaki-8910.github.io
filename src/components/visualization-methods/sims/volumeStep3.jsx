import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { alphaFromSigma, compositeBackToFront, compositeFrontToBack } from '../../../utils/vis/volume'
import { clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { colorRamp } from './volumeKit'
import { monoFont } from '../../visualization/canvasFont'

const makeAlphas = (count) => Array.from({ length: count }, (_, i) => alphaFromSigma(0.08 + 0.72 * (0.5 + 0.5 * Math.sin(i * 1.73)) ** 2, 1))

export default function VolumeStep3() {
  const [count, setCount] = useState(12)
  const [alphas, setAlphas] = useState(() => makeAlphas(12))
  const [selected, setSelected] = useState(0)
  const stateRef = useRef({ count, alphas, selected })
  stateRef.current = { count, alphas, selected }
  const setSampleCount = (value) => { const n = Math.round(value); setCount(n); setAlphas(makeAlphas(n)); setSelected(0) }
  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    const left = 38; const right = width - 18; const top = 28; const bottom = height - 58; const cell = (right - left) / state.count
    const sampleColors = state.alphas.map((_, i) => colorRamp(colors, i / Math.max(1, state.count - 1)))
    const running = state.alphas.map((_, i) => compositeFrontToBack(sampleColors.slice(0, i + 1), state.alphas.slice(0, i + 1)))
    let stopped = false
    state.alphas.forEach((alpha, i) => {
      const x = left + (i + 0.5) * cell
      if (i > 0 && running[i - 1].alpha >= 0.99) stopped = true
      ctx.globalAlpha = stopped ? 0.25 : 1
      const c = sampleColors[i]
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`
      ctx.fillRect(x - cell * 0.32, bottom - alpha * (bottom - top), cell * 0.64, alpha * (bottom - top))
      markerCircle(ctx, x, bottom - alpha * (bottom - top), 5, { fill: colors.accent, stroke: colors.ink, lineWidth: i === state.selected ? 3 : 1 })
      const result = running[i]
      // まだ透けて見えている割合 1 − A(高さ 16px の棒。手前から足すほど低くなる)
      const remaining = 1 - result.alpha
      ctx.fillStyle = colors.muted
      ctx.fillRect(x - cell * 0.32, bottom + 24 - 16 * remaining, cell * 0.64, 16 * remaining)
      // ここまで足した色を、奥の地(surface)の上で見たときの色 C + (1 − A)·地
      const seen = result.color.map((v, k) => Math.round(255 * Math.min(1, v + remaining * colors.rgb.surface[k] / 255)))
      ctx.fillStyle = `rgb(${seen.join(' ')})`
      ctx.fillRect(x - cell * 0.32, bottom + 32, cell * 0.64, 16)
      ctx.strokeStyle = colors.ink
      if (!stopped && result.alpha >= 0.99) { ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x + cell / 2, top); ctx.lineTo(x + cell / 2, bottom + 50); ctx.stroke(); ctx.setLineDash([]) }
    })
    ctx.globalAlpha = 1
    ctx.fillStyle = colors.ink; ctx.font = monoFont(11); ctx.textAlign = 'left'
    ctx.fillText('αᵢ', 10, top + 8); ctx.fillText('1−A', 4, bottom + 22); ctx.fillText('C', 12, bottom + 44)
  }
  const { canvasRef, redraw, sizeRef, getColors } = useCanvas({ draw })
  useEffect(() => { redraw() }, [count, alphas, selected])
  const hit = (p) => {
    const left = 38; const right = sizeRef.current.width - 18; const cell = (right - left) / count
    const i = Math.floor((p.x - left) / cell)
    return i >= 0 && i < count ? i : -1
  }
  const move = (i, p) => {
    const top = 28; const bottom = sizeRef.current.height - 58
    setAlphas((data) => data.map((value, index) => index === i ? clamp((bottom - p.y) / (bottom - top), 0, 1) : value))
  }
  usePointerDrag(canvasRef, { canGrab: (p) => hit(p) >= 0, onDown: (p) => { const i = hit(p); if (i < 0) return false; setSelected(i); move(i, p); return true }, onMove: (p) => move(selected, p) })
  const onKeyDown = (event) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSelected((i) => clamp(i + (event.key === 'ArrowRight' ? 1 : -1), 0, count - 1))
    else setAlphas((data) => data.map((value, i) => i === selected ? clamp(value + (event.key === 'ArrowUp' ? 0.03 : -0.03), 0, 1) : value))
  }
  const colors = getColors()
  const sampleColors = alphas.map((_, i) => colorRamp(colors, i / Math.max(1, count - 1)))
  const front = compositeFrontToBack(sampleColors, alphas, { stopAt: 1 })
  const back = compositeBackToFront(sampleColors, alphas)
  const swatch = (result) => `rgb(${result.color.map((v) => Math.round(v * 255)).join(' ')})`
  return <SimShell label="前から順の合成" stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="光線上の不透明度。棒を上下にドラッグ、矢印キーで選択と調整" />} controls={<ParamSlider symbol="N" label="標本数" value={count} min={4} max={24} step={1} onChange={setSampleCount} />} legend={<SimLegend items={[
    { key: 'front', label: '前から', value: `C ${front.color.map((v) => v.toFixed(2)).join(', ')} / A ${front.alpha.toFixed(3)}`, swatch: swatch(front) },
    { key: 'back', label: '後ろから', value: `C ${back.color.map((v) => v.toFixed(2)).join(', ')} / A ${back.alpha.toFixed(3)}`, swatch: swatch(back) },
    { key: 'used', label: '合成した標本', value: `${front.used} / ${count}` },
  ]} />} />
}
