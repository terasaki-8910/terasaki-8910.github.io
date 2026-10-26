import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { castRay, sampleVolume, sampleVolumeNearest, transferFunction } from '../../../utils/vis/volume'
import { clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { blitPixels } from './pixelKit'
import { colorRamp, PHANTOM_VOLUME, TF_PRESETS, valueRamp, VOXEL_DS, VOLUME_N } from './volumeKit'

export default function VolumeStep5() {
  const [ends, setEnds] = useState([[-0.75, -0.55], [0.72, 0.62]])
  const [dsVoxels, setDsVoxels] = useState(1)
  const [correct, setCorrect] = useState(true)
  const [selected, setSelected] = useState(0)
  const stateRef = useRef({ ends, dsVoxels, correct, selected })
  stateRef.current = { ends, dsVoxels, correct, selected }
  const sliceRect = (width, height) => { const side = Math.min(width * 0.42, height * 0.62); return { x: 28, y: 18, side } }
  const pointToScreen = (point, rect) => [rect.x + (point[0] + 1) * rect.side / 2, rect.y + (1 - point[1]) * rect.side / 2]
  const screenToPoint = (p, rect) => [clamp((p.x - rect.x) * 2 / rect.side - 1, -1, 1), clamp(1 - (p.y - rect.y) * 2 / rect.side, -1, 1)]
  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current; const rect = sliceRect(width, height); const sliceSize = 96
    const tfLut = Array.from({ length: 256 }, (_, i) => transferFunction(TF_PRESETS['全部'], i / 255))
    const colorLut = Array.from({ length: 256 }, (_, i) => colorRamp(colors, i / 255))
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    const slice = ctx.createImageData(sliceSize, sliceSize)
    for (let y = 0; y < sliceSize; y++) for (let x = 0; x < sliceSize; x++) {
      const value = sampleVolume(PHANTOM_VOLUME, VOLUME_N, 2 * (x + 0.5) / sliceSize - 1, 1 - 2 * (y + 0.5) / sliceSize, 0)
      const c = valueRamp(colors, value); const o = (y * sliceSize + x) * 4
      for (let ch = 0; ch < 3; ch++) slice.data[o + ch] = Math.round(c[ch] * 255)
      slice.data[o + 3] = 255
    }
    blitPixels(ctx, slice, sliceSize, sliceSize, rect.x, rect.y, rect.side, rect.side)
    const a = pointToScreen(state.ends[0], rect); const b = pointToScreen(state.ends[1], rect)
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
    state.ends.forEach((point, i) => { const p = pointToScreen(point, rect); markerCircle(ctx, p[0], p[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: i === state.selected ? 3 : 1.5 }) })
    const length = Math.hypot(state.ends[1][0] - state.ends[0][0], state.ends[1][1] - state.ends[0][1])
    const count = Math.max(2, Math.floor(length / (state.dsVoxels * VOXEL_DS)) + 1)
    const graphX = rect.x + rect.side + 30; const graphW = width - graphX - 18; const graphTop = 22; const graphBottom = rect.y + rect.side
    ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(graphX, graphBottom); ctx.lineTo(width - 18, graphBottom); ctx.stroke()
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); const x = state.ends[0][0] * (1 - t) + state.ends[1][0] * t; const y = state.ends[0][1] * (1 - t) + state.ends[1][1] * t
      const p = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t]
      markerCircle(ctx, p[0], p[1], 2.5, { fill: colors.ink, stroke: colors.ink })
      const linear = sampleVolume(PHANTOM_VOLUME, VOLUME_N, x, y, 0); const nearest = sampleVolumeNearest(PHANTOM_VOLUME, VOLUME_N, x, y, 0)
      const gx = graphX + t * graphW
      ctx.fillStyle = colors.alpha('lane-1', 1); ctx.fillRect(gx - 2, graphBottom - linear * (graphBottom - graphTop), 4, 4)
      ctx.fillStyle = colors.ink; ctx.fillRect(gx - 1.5, graphBottom - nearest * (graphBottom - graphTop), 3, 3)
    }
    ctx.fillStyle = colors.muted; ctx.font = '11px sans-serif'; ctx.fillText('線形', graphX, graphTop); ctx.fillText('最近傍', graphX + 38, graphTop)
    const renderSize = 64; const gap = 12; const totalW = renderSize * 3 + gap * 2; const startX = Math.max(12, (width - totalW) / 2); const y0 = height - renderSize - 18
    ;[0.5, 1, 2].forEach((spacing, panel) => {
      const image = ctx.createImageData(renderSize, renderSize)
      for (let y = 0; y < renderSize; y++) for (let x = 0; x < renderSize; x++) {
        const wx = 2 * (x + 0.5) / renderSize - 1; const wy = 1 - 2 * (y + 0.5) / renderSize
        const result = castRay(PHANTOM_VOLUME, VOLUME_N, [wx, wy, 2.5], [0, 0, -1], {
          mode: 'composite', ds: spacing * VOXEL_DS, ds0: state.correct ? VOXEL_DS : spacing * VOXEL_DS, stopAt: 0.98,
          tf: (value) => tfLut[Math.max(0, Math.min(255, Math.round(value * 255)))],
          colorOf: (t) => colorLut[Math.max(0, Math.min(255, Math.round(t * 255)))],
        })
        const o = (y * renderSize + x) * 4
        for (let ch = 0; ch < 3; ch++) image.data[o + ch] = Math.round(255 * result.color[ch] + colors.rgb.surface[ch] * (1 - result.alpha))
        image.data[o + 3] = 255
      }
      blitPixels(ctx, image, renderSize, renderSize, startX + panel * (renderSize + gap), y0, renderSize, renderSize)
      ctx.fillStyle = colors.ink; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`Δs ${spacing}`, startX + panel * (renderSize + gap) + renderSize / 2, height - 4)
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [ends, dsVoxels, correct, selected])
  const hit = (p) => { const rect = sliceRect(sizeRef.current.width, sizeRef.current.height); let found = -1; ends.forEach((point, i) => { const s = pointToScreen(point, rect); if (Math.hypot(p.x - s[0], p.y - s[1]) < 20) found = i }); return found }
  const move = (i, p) => { const rect = sliceRect(sizeRef.current.width, sizeRef.current.height); setEnds((data) => data.map((point, index) => index === i ? screenToPoint(p, rect) : point)) }
  usePointerDrag(canvasRef, { canGrab: (p) => hit(p) >= 0, onDown: (p) => { const i = hit(p); if (i < 0) return false; setSelected(i); move(i, p); return true }, onMove: (p) => move(selected, p) })
  const onKeyDown = (event) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault(); const amount = event.shiftKey ? 0.1 : 0.03
    setEnds((data) => data.map((point, i) => i === selected ? [clamp(point[0] + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0), -1, 1), clamp(point[1] + (event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0), -1, 1)] : point))
  }
  return <SimShell label="標本間隔と補間" stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="断面上の光線。端点をドラッグまたは矢印キーで移動" />} controls={<>
    <ParamSlider symbol="\Delta s" label="光線上の標本間隔" value={dsVoxels} min={0.5} max={2} step={0.25} unit=" voxel" onChange={setDsVoxels} />
    <SimToolbar><ToggleButton pressed={correct} onChange={setCorrect}>不透明度を補正</ToggleButton></SimToolbar>
  </>} legend={<SimLegend items={[
    { key: 'linear', label: '線形補間', swatch: 'var(--lane-1)' },
    { key: 'nearest', label: '最近傍', swatch: 'var(--color-ink)' },
    { key: 'correction', label: '不透明度補正', value: correct ? 'オン' : 'オフ' },
  ]} />} />
}
