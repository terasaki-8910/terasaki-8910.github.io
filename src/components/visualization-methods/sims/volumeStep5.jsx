import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { castRay, sampleVolume, sampleVolumeNearest, transferFunction } from '../../../utils/vis/volume'
import { arrowStep, clamp, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { blitPixels } from './pixelKit'
import { colorRamp, PHANTOM_VOLUME, TF_PRESETS, valueRamp, VOXEL_DS, VOLUME_N } from './volumeKit'
import { selectKey } from './volumeKeys'

const KEY_STEP = 0.03 // 矢印キー 1 回の量(世界の座標。Shift で 5 倍)

export default function VolumeStep5() {
  const [ends, setEnds] = useState([[-0.75, -0.55], [0.72, 0.62]])
  const [dsVoxels, setDsVoxels] = useState(1)
  const [correct, setCorrect] = useState(true)
  const [selected, setSelected] = useState(0)
  const stateRef = useRef({ ends, dsVoxels, correct, selected })
  stateRef.current = { ends, dsVoxels, correct, selected }
  const live = useRef(null)
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const describe = (data, i) => `端点 ${i + 1} / ${data.length}：x ${fmt(data[i][0], 2)}、y ${fmt(data[i][1], 2)}`
  // 断面の絵(正方形)。下に 64 px の小さな画像 3 枚が並ぶので、その上に収める(狭い幅で重ならないように)
  const sliceRect = (width, height) => { const side = Math.max(60, Math.min(width * 0.42, height * 0.62, height - 112)); return { x: 28, y: 18, side } }
  const pointToScreen = (point, rect) => [rect.x + (point[0] + 1) * rect.side / 2, rect.y + (1 - point[1]) * rect.side / 2]
  const screenToPoint = (p, rect) => [clamp((p.x - rect.x) * 2 / rect.side - 1, -1, 1), clamp(1 - (p.y - rect.y) * 2 / rect.side, -1, 1)]
  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current; const rect = sliceRect(width, height); const sliceSize = 96
    const tfLut = Array.from({ length: 256 }, (_, i) => transferFunction(TF_PRESETS['全部'], i / 255))
    const colorLut = Array.from({ length: 256 }, (_, i) => colorRamp(colors, i / 255))
    ctx.save()
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
    // 断面の絵は、どちらのテーマでも背景(値 0)が暗い。ライトのテーマの ink は背景と同じ暗さで見えないので、
    // 光線・標本の点・端点の縁は ink と surface の明るい方で描き、明るい骨の上でも見えるよう光線には暗い縁を付ける
    const bright = colors.dark ? colors.ink : colors.surface
    const dim = colors.dark ? colors.surface : colors.ink
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b)
    ctx.strokeStyle = dim; ctx.lineWidth = 4; ctx.stroke()
    ctx.strokeStyle = bright; ctx.lineWidth = 2; ctx.stroke()
    const length = Math.hypot(state.ends[1][0] - state.ends[0][0], state.ends[1][1] - state.ends[0][1])
    const count = Math.max(2, Math.floor(length / (state.dsVoxels * VOXEL_DS)) + 1)
    const graphX = rect.x + rect.side + 30; const graphW = width - graphX - 18; const graphTop = 22; const graphBottom = rect.y + rect.side
    ctx.strokeStyle = colors.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(graphX, graphBottom); ctx.lineTo(width - 18, graphBottom); ctx.stroke()
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); const x = state.ends[0][0] * (1 - t) + state.ends[1][0] * t; const y = state.ends[0][1] * (1 - t) + state.ends[1][1] * t
      const p = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t]
      markerCircle(ctx, p[0], p[1], 2.5, { fill: bright })
      const linear = sampleVolume(PHANTOM_VOLUME, VOLUME_N, x, y, 0); const nearest = sampleVolumeNearest(PHANTOM_VOLUME, VOLUME_N, x, y, 0)
      const gx = graphX + t * graphW
      ctx.fillStyle = colors.alpha('lane-1', 1); ctx.fillRect(gx - 2, graphBottom - linear * (graphBottom - graphTop), 4, 4)
      ctx.fillStyle = colors.ink; ctx.fillRect(gx - 1.5, graphBottom - nearest * (graphBottom - graphTop), 3, 3)
    }
    // 端点の丸は標本の点より手前に描く(選んでいる端点の太い縁が、点に隠れないように)
    state.ends.forEach((point, i) => { const p = pointToScreen(point, rect); markerCircle(ctx, p[0], p[1], 7, { fill: colors.accent, stroke: bright, lineWidth: i === state.selected ? 3 : 1.5 }) })
    // 文字は ink(muted は小さい文字の 4.5:1 に届かない)。揃えは毎回指定する
    ctx.fillStyle = colors.ink; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('線形', graphX, graphTop); ctx.fillText('最近傍', graphX + 38, graphTop)
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
    ctx.restore()
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [ends, dsVoxels, correct, selected])
  const hit = (p) => { const rect = sliceRect(sizeRef.current.width, sizeRef.current.height); let found = -1; stateRef.current.ends.forEach((point, i) => { const s = pointToScreen(point, rect); if (Math.hypot(p.x - s[0], p.y - s[1]) < 20) found = i }); return found }
  const move = (i, p) => { const rect = sliceRect(sizeRef.current.width, sizeRef.current.height); setEnds((data) => data.map((point, index) => index === i ? screenToPoint(p, rect) : point)) }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hit(p) >= 0,
    onDown: (p) => {
      const i = hit(p)
      if (i < 0) return false
      stateRef.current.selected = i // 再描画を待たずに、つかんだ端点を動かす
      setSelected(i)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      move(i, p)
      return true
    },
    onMove: (p) => move(stateRef.current.selected, p),
  })
  const onKeyDown = (event) => {
    const { ends: data, selected: active } = stateRef.current
    // PageUp・PageDown・Home・End: 端点を選ぶ
    const pick = selectKey(event, active, data.length)
    if (pick !== null) {
      event.preventDefault()
      stateRef.current.selected = pick
      setSelected(pick)
      announce(describe(data, pick))
      return
    }
    // 矢印キー: 選んでいる端点を動かす(Shift で 5 倍)
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const next = data.map((point, i) => i === active ? [clamp(point[0] + step.dx * KEY_STEP, -1, 1), clamp(point[1] + step.dy * KEY_STEP, -1, 1)] : point)
    stateRef.current.ends = next
    setEnds(next)
    announce(describe(next, active))
  }
  return <SimShell label="標本間隔と補間" height={{ phone: [320, 400], pc: [280, 360] }} stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="頭部ファントムの断面と、その上を通る光線（両端が丸）。光線上の標本点での値を線形補間と最近傍で比べたグラフと、標本間隔 Δs を 0.5・1・2 voxel にして描いた 3 枚の小さな画像。丸をドラッグすると光線の端点が動く。PageUp・PageDown で端点を選び、矢印キーで動かす（Shift で 5 倍）" />} controls={<>
    <ParamSlider symbol="\Delta s" label="光線上の標本間隔" value={dsVoxels} min={0.5} max={2} step={0.25} unit=" voxel" onChange={setDsVoxels} />
    <SimToolbar><ToggleButton pressed={correct} onChange={setCorrect}>不透明度を補正</ToggleButton></SimToolbar>
  </>} legend={<>
    <SimLegend items={[
      { key: 'linear', label: '線形補間', swatch: 'var(--lane-1)' },
      { key: 'nearest', label: '最近傍', swatch: 'var(--color-ink)' },
      { key: 'correction', label: '不透明度補正', value: correct ? 'オン' : 'オフ' },
    ]} />
    <span className="sr-only" role="status" aria-live="polite" ref={live} />
  </>} />
}
