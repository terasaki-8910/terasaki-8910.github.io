import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { PlayPauseButton, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop, { prefersReducedMotion } from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { SHEPP_LOGAN } from '../../../utils/vis/ct'
import {
  VALUE_MAX, clampNumber, createPipeline, drawBottomTicks, drawFrame, drawGrayImage, drawImageTitle, drawLeftTicks, grayRampSwatch,
  phantomValues, useIsDark,
} from './ctKit'

const N_DET = 128
const N_IMG = 128
const MAX_ANGLES = 180
const ELLIPSES = SHEPP_LOGAN

function layoutOf(width, height) {
  const pad = 8
  const gap = 12
  const label = 34
  const three = width >= 520
  const count = three ? 3 : 2
  const S = Math.max(60, Math.min((width - 2 * pad - (count - 1) * gap - label) / count, height - 2 * pad - 22, 330))
  const used = count * S + (count - 1) * gap + label
  const x0 = (width - used) / 2
  const y = Math.max(pad, (height - 22 - S) / 2)
  let x = x0
  const phantom = three ? { x, y, w: S, h: S } : null
  if (three) x += S + gap
  const sino = { x: x + label, y, w: S, h: S }
  const recon = { x: sino.x + S + gap, y, w: S, h: S }
  return { phantom, sino, recon }
}

export default function CtStep3() {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? 12 : 1))
  const dark = useIsDark()
  const legendRef = useRef(null)
  const countRef = useRef(count) // 再生では小数で進める
  countRef.current = Math.floor(countRef.current) === count ? countRef.current : count
  const pipelineRef = useRef(null)
  if (!pipelineRef.current) pipelineRef.current = createPipeline()
  const scrubRef = useRef(null)
  const stateRef = useRef(null)
  stateRef.current = { count }

  const draw = ({ ctx, width, height, colors }) => {
    const { count: n } = stateRef.current
    const { phantom, sino, recon } = layoutOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const result = pipelineRef.current({ ellipses: ELLIPSES, nAngles: n, nDet: N_DET, noise: 0, pre: 'none', filter: 'none', post: 'none', upTo: n, n: N_IMG })
    if (phantom) {
      drawGrayImage(ctx, colors, phantomValues(ELLIPSES, N_IMG), N_IMG, N_IMG, phantom)
      drawFrame(ctx, colors, phantom)
      drawImageTitle(ctx, colors, '模型', phantom)
    }
    drawGrayImage(ctx, colors, result.measured, N_DET, n, sino, { crispRows: true })
    drawFrame(ctx, colors, sino)
    drawBottomTicks(ctx, colors, sino, [{ at: 0, label: '−1' }, { at: 0.5, label: 's = 0' }, { at: 1, label: '1' }])
    drawLeftTicks(ctx, colors, sino, [{ at: 0, label: '0°' }, { at: 0.5, label: '90°' }, { at: 1, label: '180°' }])
    drawImageTitle(ctx, colors, 'サイノグラム', sino)
    drawGrayImage(ctx, colors, result.recon, N_IMG, N_IMG, recon, { min: result.range[0], max: result.range[1] })
    drawFrame(ctx, colors, recon)
    drawImageTitle(ctx, colors, '逆投影', recon)
    legendRef.current?.update({ count: `${n}`, step: `${(180 / n).toFixed(n >= 90 ? 1 : 0)}°` })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  // 再生: 角度の数を 1 から 180 まで増やす(数が小さいうちはゆっくり、増えるほど速く)
  const loop = useSimLoop((dt) => {
    const next = Math.min(MAX_ANGLES, countRef.current + dt * (3 + 0.55 * countRef.current))
    countRef.current = next
    setCount(Math.floor(next))
    if (next >= MAX_ANGLES) loop.pause()
  }, { targetRef: canvasRef })
  const setAngles = (value) => {
    const v = clampNumber(Math.round(value), 1, MAX_ANGLES)
    countRef.current = v
    setCount(v)
  }
  const scrub = (value) => {
    loop.pause()
    setAngles(value)
  }
  const togglePlay = () => {
    if (!loop.running && countRef.current >= MAX_ANGLES) setAngles(1)
    loop.toggle()
  }

  // 絵の上を横になぞって角度の数を変える(サイノグラムと逆投影の上)
  const overPanel = (p) => {
    const { width, height } = sizeRef.current
    const { sino, recon } = layoutOf(width, height)
    return [sino, recon].some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
  }
  usePointerDrag(canvasRef, {
    cursorAt: (p) => (overPanel(p) ? 'ew-resize' : ''),
    onDown: (p) => {
      if (!overPanel(p)) return false
      loop.pause()
      scrubRef.current = countRef.current
      return true
    },
    onMove: ({ dx }) => {
      if (scrubRef.current === null) return
      scrubRef.current = clampNumber(scrubRef.current + dx * 0.5, 1, MAX_ANGLES)
      setAngles(scrubRef.current)
    },
    onUp: () => { scrubRef.current = null },
  })
  const onKeyDown = (event) => {
    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
    if (!delta) return
    event.preventDefault()
    scrub(countRef.current + delta * (event.shiftKey ? 10 : 1))
  }

  return (
    <SimShell
      label="逆投影"
      height={{ phone: [250, 320], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="向きごとの投影を並べたサイノグラムと、それを塗り戻して足した逆投影の像。サイノグラムと逆投影の上を横になぞるか、左右の矢印キーで角度の数を変えます。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'count', symbol: 'N', label: '角度の数', value: '1', minChars: 3 },
        { key: 'step', label: '角度の間隔', value: '180°', minChars: 5 },
        { key: 'gray', label: '模型・サイノグラムの灰色', value: `0 → ${VALUE_MAX}`, swatch: grayRampSwatch(dark) },
        { key: 'grayBp', label: '逆投影の灰色', value: '最小 → 最大', swatch: grayRampSwatch(dark) },
      ]} />}
      controls={<>
        <SimToolbar>
          <PlayPauseButton running={loop.running} onToggle={togglePlay} />
          <ResetButton onClick={() => { loop.pause(); setAngles(1) }} />
        </SimToolbar>
        <ParamSlider symbol="N" label="角度の数" value={count} min={1} max={MAX_ANGLES} step={1} onChange={scrub} format={(v) => v.toFixed(0)} />
      </>}
    />
  )
}
