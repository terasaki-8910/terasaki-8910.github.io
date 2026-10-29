import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { PlayPauseButton, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop, { prefersReducedMotion } from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { squareWavePartialSum } from '../../../utils/vis/ct'
import { fft } from '../../../utils/vis/fft'
import { clampNumber, drawPlotAxes, plotMap, squareWaveAmplitude, squareWaveComponent } from './ctKit'

const K_MAX = 49
const SAMPLES = 256 // FFT にかける、1 周期の標本の数
const PLAY_STEP = 0.22 // 再生で K が 2 増える間隔(s)

// 矩形波(周期 2π、前半 +1、後半 −1)を 1 周期ぶん標本にして FFT し、正弦波 sin(kt) の振れ幅(2|X_k|/N)を k = 0..K_MAX で求める。
// 標本は区間の真ん中で取る(跳びの上に標本が乗らないように)
const FFT_AMPLITUDE = (() => {
  const re = new Float64Array(SAMPLES)
  const im = new Float64Array(SAMPLES)
  for (let m = 0; m < SAMPLES; m++) re[m] = m < SAMPLES / 2 ? 1 : -1
  fft(re, im)
  return Array.from({ length: K_MAX + 1 }, (_, k) => (2 * Math.hypot(re[k], im[k])) / SAMPLES)
})()
const AMPLITUDE = Array.from({ length: K_MAX + 1 }, (_, k) => (k % 2 === 1 ? squareWaveAmplitude(k) : 0))

const oddOf = (x) => Math.min(K_MAX, Math.max(1, Math.floor((x - 1) / 2) * 2 + 1))
const T_RANGE = [-Math.PI, 3 * Math.PI]
const PI_TICKS = [[-Math.PI, '−π'], [0, '0'], [Math.PI, 'π'], [2 * Math.PI, '2π'], [3 * Math.PI, '3π']]

function layoutOf(width, height) {
  const left = 44
  const right = 26
  const usable = Math.max(120, height - 22 - 46 - 28)
  const waveH = Math.round(usable * 0.6)
  const barsH = usable - waveH
  const wave = { x: left, y: 22, w: width - left - right, h: waveH }
  const bars = { x: left, y: wave.y + waveH + 46, w: width - left - right, h: barsH }
  return { wave, bars }
}

export default function CtStep4() {
  const [K, setK] = useState(() => (prefersReducedMotion() ? 7 : 1))
  const legendRef = useRef(null)
  const kRef = useRef(K) // 再生では小数で進める
  kRef.current = oddOf(kRef.current) === K ? kRef.current : K
  const grabRef = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = { K }

  const draw = ({ ctx, width, height, colors }) => {
    const { K: k } = stateRef.current
    const { wave, bars } = layoutOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 波: 矩形波(細い線)、各成分(薄く)、足したもの(ink)
    const wmap = plotMap(wave, T_RANGE, [-1.5, 1.5])
    drawPlotAxes(ctx, colors, wmap, {
      xTicks: PI_TICKS.filter((_, i) => wave.w >= 300 || i % 2 === 1).map(([v, label]) => ({ v, label })),
      yTicks: [-1, 0, 1].map((v) => ({ v, label: v < 0 ? '−1' : `${v}` })),
      xName: 't',
    })
    drawText(ctx, `${(k + 1) / 2} 個の正弦波を足した和（k = 1, 3, …, ${k}）`, wave.x, wave.y - 8, { color: colors.ink, size: 12, baseline: 'bottom' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(wave.x, wave.y - 2, wave.w, wave.h + 4)
    ctx.clip()
    const points = Math.max(200, Math.round(wave.w))
    const curve = (fn) => {
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const t = T_RANGE[0] + ((T_RANGE[1] - T_RANGE[0]) * i) / points
        const x = wmap.px(t)
        const y = wmap.py(fn(t))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    // 矩形波そのもの(跳びの所は縦線にしない)
    ctx.strokeStyle = colors.alpha('ink', 0.45)
    ctx.lineWidth = 1.25
    ctx.setLineDash([5, 4])
    for (let period = -1; period <= 1; period++) {
      for (const [a, b, v] of [[0, Math.PI, 1], [Math.PI, 2 * Math.PI, -1]]) {
        ctx.beginPath()
        ctx.moveTo(wmap.px(a + period * 2 * Math.PI), wmap.py(v))
        ctx.lineTo(wmap.px(b + period * 2 * Math.PI), wmap.py(v))
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.lineWidth = 1
    for (let j = 1; j < k; j += 2) {
      ctx.strokeStyle = colors.alpha('lane-1', 0.3)
      curve((t) => squareWaveComponent(t, j))
    }
    ctx.strokeStyle = colors.alpha('lane-3', 1)
    ctx.lineWidth = 1.75
    curve((t) => squareWaveComponent(t, k))
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    curve((t) => squareWavePartialSum(t, k))
    ctx.restore()

    // 係数の棒グラフ(振れ幅 4/(πk))と、FFT で求めた大きさの点
    const bmap = plotMap(bars, [0, K_MAX + 1], [0, 1.5])
    drawPlotAxes(ctx, colors, bmap, {
      xTicks: [1, 11, 21, 31, 41].map((v) => ({ v, label: `${v}` })),
      yTicks: [0, 0.5, 1].map((v) => ({ v, label: `${v}` })),
      xName: 'k',
    })
    drawText(ctx, '正弦波 sin(kt) の振れ幅 4/(πk)', bars.x, bars.y - 8, { color: colors.ink, size: 12, baseline: 'bottom' })
    const half = Math.max(1.5, (bmap.px(1) - bmap.px(0)) * 0.36)
    for (let j = 1; j <= K_MAX; j += 2) {
      const x = bmap.px(j)
      const y = bmap.py(AMPLITUDE[j])
      if (j <= k) {
        ctx.fillStyle = colors.ink
        ctx.fillRect(x - half, y, half * 2, bmap.py(0) - y)
      } else {
        ctx.strokeStyle = colors.alpha('muted', 0.8)
        ctx.lineWidth = 1
        ctx.strokeRect(x - half + 0.5, y + 0.5, half * 2 - 1, bmap.py(0) - y - 1)
      }
    }
    for (let j = 1; j <= K_MAX; j++) {
      markerCircle(ctx, bmap.px(j), bmap.py(FFT_AMPLITUDE[j]), 2.75, { fill: colors.alpha('lane-3', 1), stroke: colors.surface, lineWidth: 1 })
    }
    // 足す範囲の端(つかんで動かす)
    const edge = Math.round(bmap.px(k + 1)) + 0.5
    ctx.save()
    ctx.strokeStyle = colors.alpha('ink', 0.7)
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(edge, bars.y - 2)
    ctx.lineTo(edge, bars.y + bars.h)
    ctx.stroke()
    ctx.restore()
    markerCircle(ctx, edge, bars.y + 4, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 2 })

    let peak = 0
    for (let i = 1; i < 800; i++) peak = Math.max(peak, squareWavePartialSum((Math.PI * i) / 800, k))
    legendRef.current?.update({ K: `${k}`, peak: peak.toFixed(2) })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const setOdd = (value) => {
    const odd = clampNumber(Math.round((value - 1) / 2) * 2 + 1, 1, K_MAX)
    kRef.current = odd
    setK(odd)
  }
  const loop = useSimLoop((dt) => {
    const next = Math.min(K_MAX, kRef.current + (2 * dt) / PLAY_STEP)
    kRef.current = next
    setK(oddOf(next))
    if (next >= K_MAX) loop.pause()
  }, { targetRef: canvasRef })
  const scrub = (value) => {
    loop.pause()
    setOdd(value)
  }
  const togglePlay = () => {
    if (!loop.running && kRef.current >= K_MAX) setOdd(1)
    loop.toggle()
  }

  const inBars = (p) => {
    const { width, height } = sizeRef.current
    const { bars } = layoutOf(width, height)
    return p.x >= bars.x - 12 && p.x <= bars.x + bars.w + 12 && p.y >= bars.y - 14 && p.y <= bars.y + bars.h + 10
  }
  const kAt = (p) => {
    const { width, height } = sizeRef.current
    const { bars } = layoutOf(width, height)
    return plotMap(bars, [0, K_MAX + 1], [0, 1.5]).xr(p.x) - 1
  }
  usePointerDrag(canvasRef, {
    canGrab: inBars,
    onDown: (p) => {
      if (!inBars(p)) return false
      loop.pause()
      grabRef.current = true
      setOdd(kAt(p))
      return true
    },
    onMove: (p) => grabRef.current && setOdd(kAt(p)),
    onUp: () => { grabRef.current = false },
  })
  const onKeyDown = (event) => {
    const delta = { ArrowRight: 2, ArrowUp: 2, ArrowLeft: -2, ArrowDown: -2 }[event.key]
    if (!delta) return
    event.preventDefault()
    scrub(kRef.current + delta * (event.shiftKey ? 5 : 1))
  }

  return (
    <SimShell
      label="フーリエ変換"
      height={{ phone: [330, 380], pc: [300, 380] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="矩形波と、奇数倍の周波数の正弦波を K まで足した和、その正弦波の振れ幅の棒グラフ。棒グラフの上をドラッグするか左右の矢印キーで K を変えます。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'sum', label: '足した和', swatch: 'var(--color-ink)' },
        { key: 'parts', label: '1 つ 1 つの正弦波', swatch: 'var(--lane-1)' },
        { key: 'fft', label: 'FFT で求めた振れ幅', swatch: 'var(--lane-3)' },
        { key: 'K', symbol: 'K', label: '足した最大の k', value: '1', minChars: 3 },
        { key: 'peak', label: '和の最大値', value: '1.00', minChars: 5 },
      ]} />}
      controls={<>
        <SimToolbar>
          <PlayPauseButton running={loop.running} onToggle={togglePlay} />
          <ResetButton onClick={() => { loop.pause(); setOdd(1) }} />
        </SimToolbar>
        <ParamSlider symbol="K" label="足す正弦波の最大の k" value={K} min={1} max={K_MAX} step={2} onChange={scrub} format={(v) => v.toFixed(0)} />
      </>}
    />
  )
}
