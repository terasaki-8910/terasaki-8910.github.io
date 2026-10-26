import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { transmittance } from '../../../utils/vis/volume'
import { clamp, markerCircle } from '../../visualization/sims/rigidKit'

const initial = [{ x: 0.8, w: 0.75, sigma: 0.7 }, { x: 1.85, w: 0.75, sigma: 1.15 }, { x: 2.9, w: 0.75, sigma: 0.45 }]

export default function VolumeStep1() {
  const [blocks, setBlocks] = useState(initial)
  const [selected, setSelected] = useState(0)
  const stateRef = useRef({ blocks, selected })
  stateRef.current = { blocks, selected }
  const map = (width, height) => ({
    sx: (x) => 52 + x / 4.5 * (width - 70),
    sySigma: (y) => height * 0.38 - y / 1.6 * height * 0.25,
    syI: (y) => height - 30 - y * height * 0.28,
  })
  const sigmaAt = (x, data) => data.reduce((sum, block) => sum + (x >= block.x && x <= block.x + block.w ? block.sigma : 0), 0)
  const draw = ({ ctx, width, height, colors }) => {
    const { blocks: data, selected: active } = stateRef.current
    const view = map(width, height)
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1
    const axes = [[52, height * 0.38, width - 18, height * 0.38], [52, height - 30, width - 18, height - 30]]
    axes.forEach(([x0, y0, x1, y1]) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke() })
    ctx.fillStyle = colors.muted; ctx.font = '12px sans-serif'; ctx.fillText('σ(x)', 14, height * 0.2); ctx.fillText('I(x)', 17, height * 0.7)
    ;[0, 0.5, 1].forEach((value) => { ctx.fillText(String(value), 25, view.syI(value) + 4) })
    ctx.fillStyle = colors.alpha('lane-1', 0.28)
    data.forEach((block, i) => {
      const left = view.sx(block.x); const right = view.sx(block.x + block.w); const top = view.sySigma(block.sigma)
      ctx.fillRect(left, top, right - left, height * 0.38 - top)
      ctx.strokeStyle = colors.ink; ctx.strokeRect(left, top, right - left, height * 0.38 - top)
      markerCircle(ctx, (left + right) / 2, top, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: i === active ? 3 : 1.5 })
    })
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.beginPath()
    const count = 140
    for (let i = 0; i <= count; i++) {
      const x = 4.5 * i / count
      const dx = 4.5 / count
      const sigmas = Array.from({ length: i }, (_, j) => sigmaAt((j + 0.5) * dx, data))
      const intensity = transmittance(sigmas, dx)
      if (i === 0) ctx.moveTo(view.sx(x), view.syI(intensity)); else ctx.lineTo(view.sx(x), view.syI(intensity))
    }
    ctx.stroke()
    ctx.fillStyle = colors.ink; ctx.font = '16px sans-serif'; ctx.fillText('光', 10, height * 0.36)
    ctx.beginPath(); ctx.moveTo(34, height * 0.38); ctx.lineTo(48, height * 0.38); ctx.stroke()
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [blocks, selected])
  const hit = ({ x, y }) => {
    const view = map(sizeRef.current.width, sizeRef.current.height)
    let best = -1
    blocks.forEach((block, i) => { if (Math.hypot(x - view.sx(block.x + block.w / 2), y - view.sySigma(block.sigma)) < 20) best = i })
    return best
  }
  const move = (i, position) => {
    const view = map(sizeRef.current.width, sizeRef.current.height)
    setBlocks((data) => data.map((block, index) => index === i ? {
      ...block,
      x: clamp((position.x - 52) / (sizeRef.current.width - 70) * 4.5 - block.w / 2, 0, 4.5 - block.w),
      sigma: clamp((sizeRef.current.height * 0.38 - position.y) / (sizeRef.current.height * 0.25) * 1.6, 0.05, 1.6),
    } : block))
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hit(p) >= 0,
    onDown: (p) => { const i = hit(p); if (i < 0) return false; setSelected(i); move(i, p); return true },
    onMove: (p) => move(selected, p),
  })
  const onKeyDown = (event) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    setBlocks((data) => data.map((block, i) => i === selected ? {
      ...block,
      x: clamp(block.x + (event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : 0), 0, 4.5 - block.w),
      sigma: clamp(block.sigma + (event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0), 0.05, 1.6),
    } : block))
  }
  const exit = transmittance(blocks.map((block) => block.sigma), 0.75)
  return <SimShell label="吸収による光の減衰" stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="吸収率の三つの区間。丸をドラッグまたは矢印キーで移動" />} legend={<SimLegend items={[
    { key: 'exit', symbol: '\\tau(0,L)', label: '出口の透過率', value: exit.toFixed(3) },
    { key: 'ratio', label: '同じ厚さの減少率', value: '同じ σ なら一定' },
  ]} />} />
}
