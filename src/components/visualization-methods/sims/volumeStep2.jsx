import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { emissionAbsorption, transmittance } from '../../../utils/vis/volume'
import { clamp, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { barKey } from './volumeKeys'

const COUNT = 8
const KEY_STEP = 0.04 // ↑ ↓ 1 回の量(Shift で 5 倍)

export default function VolumeStep2() {
  const [sigma, setSigma] = useState(() => Array.from({ length: COUNT }, (_, i) => 0.25 + 0.55 * Math.sin((i + 1) * 0.7) ** 2))
  const [emission, setEmission] = useState(() => Array.from({ length: COUNT }, (_, i) => 0.16 + 0.72 * Math.exp(-((i - 4) ** 2) / 5)))
  const [selected, setSelected] = useState({ kind: 'emission', index: 4 })
  const stateRef = useRef({ sigma, emission, selected })
  stateRef.current = { sigma, emission, selected }
  const live = useRef(null)
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const describe = (target, value) => `${target.kind === 'sigma' ? '吸収 σ' : '発光 Lₑ'}、点 ${target.index + 1} / ${COUNT}：${fmt(value, 2)}`
  const background = 0.3
  const ds = 1 / COUNT
  const total = emissionAbsorption(sigma.slice().reverse(), emission.slice().reverse(), ds, background)
  const backgroundPart = transmittance(sigma, ds) * background
  const map = (width, height) => ({ x: (i) => 46 + (i + 0.5) / COUNT * (width - 68), y: (v) => height * 0.58 - v * height * 0.36 })
  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current; const view = map(width, height)
    ctx.save()
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = colors.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(46, height * 0.58); ctx.lineTo(width - 22, height * 0.58); ctx.stroke()
    const contribution = state.sigma.map((s, i) => {
      const front = transmittance(state.sigma.slice(i + 1), ds)
      return front * emissionAbsorption([s], [state.emission[i]], ds, 0)
    })
    state.sigma.forEach((value, i) => {
      const x = view.x(i)
      const sigmaSelected = state.selected.kind === 'sigma' && state.selected.index === i
      const emissionSelected = state.selected.kind === 'emission' && state.selected.index === i
      ctx.strokeStyle = colors.alpha('lane-0', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 5, view.y(0)); ctx.lineTo(x - 5, view.y(value)); ctx.stroke()
      markerCircle(ctx, x - 5, view.y(value), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: sigmaSelected ? 3 : 1.5 })
      ctx.strokeStyle = colors.alpha('lane-3', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5, view.y(0)); ctx.lineTo(x + 5, view.y(state.emission[i])); ctx.stroke()
      markerCircle(ctx, x + 5, view.y(state.emission[i]), 6, { fill: colors.accent, stroke: colors.ink, lineWidth: emissionSelected ? 3 : 1.5 })
      ctx.fillStyle = colors.alpha('lane-1', 0.7); const h = contribution[i] * height * 0.7; ctx.fillRect(x - 7, height * 0.87 - h, 14, h)
    })
    // 文字は ink(muted は小さい文字の 4.5:1 に届かない)。揃えは毎回指定する
    ctx.fillStyle = colors.ink; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('σ', 15, height * 0.23); ctx.fillText('Lₑ', 15, height * 0.31); ctx.fillText('各点の寄与', 15, height * 0.78)
    const barX = 46; const barY = height - 20; const barW = width - 68
    ctx.fillStyle = colors.alpha('lane-3', 0.75); ctx.fillRect(barX, barY, barW * Math.max(0, total - backgroundPart), 10)
    ctx.fillStyle = colors.alpha('lane-0', 0.75); ctx.fillRect(barX + barW * Math.max(0, total - backgroundPart), barY, barW * backgroundPart, 10)
    ctx.fillStyle = colors.ink; ctx.font = '15px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('目', width - 5, height * 0.56)
    ctx.restore()
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
  const setValue = (target, value) => {
    const setter = target.kind === 'sigma' ? setSigma : setEmission
    setter((data) => data.map((v, i) => i === target.index ? value : v))
  }
  const move = (target, p) => setValue(target, clamp((sizeRef.current.height * 0.58 - p.y) / (sizeRef.current.height * 0.36), 0.02, 1))
  usePointerDrag(canvasRef, {
    canGrab: (p) => Boolean(hit(p)),
    onDown: (p) => {
      const target = hit(p)
      if (!target) return false
      stateRef.current.selected = target // 再描画を待たずに、つかんだ丸を動かす
      setSelected(target)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      move(target, p)
      return true
    },
    onMove: (p) => move(stateRef.current.selected, p),
  })
  const onKeyDown = (event) => {
    const state = stateRef.current
    const action = barKey(event, state.selected, COUNT)
    if (!action) return
    event.preventDefault()
    if (action.selected) {
      // PageUp・PageDown・Home・End は σ と Lₑ の丸をすべて順に、← → は同じ種類の隣の点
      state.selected = action.selected
      setSelected(action.selected)
      announce(describe(action.selected, state[action.selected.kind][action.selected.index]))
    } else {
      // ↑ ↓: 選んでいる丸の高さ(Shift で 5 倍)
      const value = clamp(state[state.selected.kind][state.selected.index] + action.delta * KEY_STEP, 0.02, 1)
      setValue(state.selected, value)
      announce(describe(state.selected, value))
    }
  }
  return <SimShell label="発光と吸収" stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="煙の中の 8 つの点それぞれの、吸収の大きさ σ と発光の大きさ Lₑ を高さで表した 2 本の棒、各点が目に届く光への寄与の小さな棒、目に届く光の内訳（発光の分と背景の分）の横棒。棒の先の丸をドラッグすると高さが変わる。PageUp・PageDown で σ と Lₑ の丸を順に選び、上下の矢印キーで高さを変え、左右の矢印キーで隣の点に移る（Shift で 5 倍）" />} legend={<>
    <SimLegend items={[
      { key: 'sigma', symbol: '\\sigma', label: '吸収の大きさ', swatch: 'var(--lane-0)' },
      { key: 'le', symbol: 'L_e', label: '発光の大きさ', swatch: 'var(--lane-3)' },
      { key: 'contribution', label: '各点の寄与', swatch: 'var(--lane-1)' },
      { key: 'total', symbol: 'L', label: '届く光', value: total.toFixed(3) },
      { key: 'emission', label: '発光の分', value: (total - backgroundPart).toFixed(3), swatch: 'var(--lane-3)' },
      { key: 'background', label: '背景の分', value: backgroundPart.toFixed(3), swatch: 'var(--lane-0)' },
    ]} />
    <span className="sr-only" role="status" aria-live="polite" ref={live} />
  </>} />
}
