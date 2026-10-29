import { useEffect, useMemo, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { clamp, drawText, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN, addNoise, detectorPosition, filterProjection, frequencyWindow, projectPhantom, rampKernel, rasterizePhantom } from '../../../utils/vis/ct'
import { fft, nextPow2 } from '../../../utils/vis/fft'
import {
  NARROW_WIDTH, PLOT_MARGIN, SLICE_WINDOW, dialAngle, drawGrayImage, drawPlotAxes, drawZeroLine, fixedHeight, grayRgb, insideRect, plotView,
  splitCells, strokeSeries, ticks, useStageWidth, withClip,
} from './ctFilterKit'

const N_DET = 128
const TAU = 2 / N_DET // 検出器の間隔 τ
const FFT_LEN = nextPow2(2 * N_DET) // filterProjection がたたみ込みに使う長さ
const STEM_N = 7 // カーネルの棒は n = −7〜7
const PHANTOM_N = 64
const INITIAL = { theta: 30, win: 'ram-lak', noise: 0 }
const WINDOW_OPTIONS = [
  { value: 'ram-lak', label: 'ランプ' },
  { value: 'shepp-logan', label: 'シェップ-ローガン' },
  { value: 'hann', label: 'ハン' },
]
const PHANTOM = rasterizePhantom(PHANTOM_N)

// 検出器の位置 s と、周波数 ω(最大の周波数を 1 にした値)の目盛り
const S_AXIS = Float64Array.from({ length: N_DET }, (_, m) => detectorPosition(m, N_DET))
const OMEGA = Float64Array.from({ length: FFT_LEN + 1 }, (_, i) => (i - FFT_LEN / 2) / (FFT_LEN / 2))
const STEM_AXIS = Array.from({ length: 2 * STEM_N + 1 }, (_, i) => i - STEM_N)
const IDEAL_RAMP = OMEGA.map((w) => Math.abs(w))

// 向き deg の模型の投影 1 本(式で求めた値)。雑音は最大値の noise 倍(種は向きごと)
function projectionRow(deg, noise) {
  const theta = (deg * Math.PI) / 180
  const p = new Float64Array(N_DET)
  for (let m = 0; m < N_DET; m++) p[m] = projectPhantom(SHEPP_LOGAN, S_AXIS[m], theta)
  return noise > 0 ? addNoise(p, noise, 11 + deg) : p
}

// 投影の周波数成分の大きさ(0 のときを 0 dB とした dB)。長さ FFT_LEN に 0 を詰めた FFT で、負の周波数も並べる
function spectrumDb(p) {
  const re = new Float64Array(FFT_LEN)
  const im = new Float64Array(FFT_LEN)
  re.set(p)
  fft(re, im)
  const base = Math.hypot(re[0], im[0]) || 1
  return Float64Array.from({ length: FFT_LEN + 1 }, (_, i) => {
    const k = (i - FFT_LEN / 2 + FFT_LEN) % FFT_LEN
    return 20 * Math.log10(Math.max(Math.hypot(re[k], im[k]) / base, 1e-6))
  })
}

// 窓つきのフィルタ |w|·窓(w)(最大の周波数のときの値が 1)
const filterCurve = (win) => OMEGA.map((w) => Math.abs(w) * frequencyWindow(win, Math.abs(w)))

// カーネル h(n)·τ²。Ram-Lak は rampKernel の値そのもの。窓をかけたものは、大きさ 1 の点だけの投影をフィルタにかけた結果
// (Q = τ Σ h(s − s_k) p(s_k) なので、点の投影の出力が τ·h)
const RAMP_KERNEL = rampKernel(FFT_LEN, TAU)
const RAM_LAK_STEMS = STEM_AXIS.map((n) => RAMP_KERNEL[(n + FFT_LEN) % FFT_LEN] * TAU * TAU)
const stemCache = new Map([['ram-lak', RAM_LAK_STEMS]])
function kernelStems(win) {
  if (!stemCache.has(win)) {
    const impulse = new Float64Array(N_DET)
    impulse[N_DET / 2] = 1
    const q = filterProjection(impulse, TAU, win)
    stemCache.set(win, STEM_AXIS.map((n) => q[N_DET / 2 + n] * TAU))
  }
  return stemCache.get(win)
}

// 絵の枠: 模型の図、投影、周波数成分、フィルタ、フィルタ後の投影、カーネルの順(広いときは 3 × 2、狭いときは 2 × 3)
function layout(width, height) {
  const area = { x: 6, y: 6, w: width - 12, h: height - 12 }
  return width < NARROW_WIDTH ? splitCells(area, 2, 3, 6) : splitCells(area, 3, 2, 8)
}

// 絵の高さ: 枠の高さが幅の 0.72 倍(130〜200)になる高さ
function stageHeight(width) {
  if (width < NARROW_WIDTH) return 3 * 140 + 12 + 12
  const cellW = (width - 12 - 16) / 3
  return Math.round(2 * Math.min(200, Math.max(130, cellW * 0.72)) + 8 + 12)
}

// 模型の図の幾何: 画像の一辺 a、検出器の帯までの距離 ring、帯の半分の長さ bar
function dialGeometry(cell) {
  const area = { x: cell.x, y: cell.y + PLOT_MARGIN.top, w: cell.w, h: cell.h - PLOT_MARGIN.top }
  const a = Math.floor(Math.min(area.w, area.h) * 0.6)
  return { area, cx: area.x + area.w / 2, cy: area.y + area.h / 2, a, ring: a * 0.58, bar: a * 0.55 }
}

// 向き θ(度)の、画面上の向き: +s の向き u と、光線が進む向き v(画面の y は下向き)
function directions(deg) {
  const t = (deg * Math.PI) / 180
  return { u: [Math.cos(t), -Math.sin(t)], v: [-Math.sin(t), -Math.cos(t)] }
}

function drawDial(ctx, size, colors, cell, deg) {
  const g = dialGeometry(cell)
  const { u, v } = directions(deg)
  const image = { x: Math.round(g.cx - g.a / 2), y: Math.round(g.cy - g.a / 2), w: g.a, h: g.a }
  drawGrayImage(ctx, colors, PHANTOM, PHANTOM_N, PHANTOM_N, image, { lo: SLICE_WINDOW[0], hi: SLICE_WINDOW[1] })
  const half = g.a / 2
  const strokeRays = () => {
    ctx.beginPath()
    for (const s of [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]) {
      const bx = g.cx + s * half * u[0]
      const by = g.cy + s * half * u[1]
      ctx.moveTo(bx - g.ring * v[0], by - g.ring * v[1])
      ctx.lineTo(bx + g.ring * v[0], by + g.ring * v[1])
    }
    ctx.stroke()
  }
  // 光線は、画像の外では ink、画像の上では画像の明るい方の灰色(画像は暗い所が多いので)
  ctx.save()
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(0, 0, size.width, size.height)
  ctx.rect(image.x, image.y, image.w, image.h)
  ctx.clip('evenodd')
  ctx.strokeStyle = colors.alpha('ink', 0.45)
  strokeRays()
  ctx.restore()
  ctx.save()
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(image.x, image.y, image.w, image.h)
  ctx.clip()
  ctx.strokeStyle = `rgb(${grayRgb(colors, 1).join(' ')} / 0.6)`
  strokeRays()
  ctx.restore()
  // 取っ手が動く半円(θ = 0 が真上、180° が真下)
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.setLineDash([2, 4])
  ctx.beginPath()
  for (let i = 0; i <= 48; i++) {
    const t = (Math.PI * i) / 48
    const x = g.cx - g.ring * Math.sin(t)
    const y = g.cy - g.ring * Math.cos(t)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  // 検出器の帯(+s の向きに矢じり)
  const dx = g.cx + g.ring * v[0]
  const dy = g.cy + g.ring * v[1]
  const ex = dx + g.bar * u[0]
  const ey = dy + g.bar * u[1]
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = colors.ink
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(dx - g.bar * u[0], dy - g.bar * u[1])
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex + u[0] * 6, ey + u[1] * 6)
  ctx.lineTo(ex - u[0] * 3 - u[1] * 5, ey - u[1] * 3 + u[0] * 5)
  ctx.lineTo(ex - u[0] * 3 + u[1] * 5, ey - u[1] * 3 - u[0] * 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  drawText(ctx, 's', ex - v[0] * 11 - u[0] * 8, ey - v[1] * 11 - u[1] * 8, { color: colors.ink, size: 11, align: 'center', baseline: 'middle' })
  markerCircle(ctx, dx, dy, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })
  drawText(ctx, `向き θ = ${deg}°`, cell.x + PLOT_MARGIN.left, cell.y + PLOT_MARGIN.top - 8, { color: colors.ink, size: 12, baseline: 'bottom' })
}

export default function CtStep6() {
  const [theta, setTheta] = useState(INITIAL.theta)
  const [win, setWin] = useState(INITIAL.win)
  const [noise, setNoise] = useState(INITIAL.noise)
  const data = useMemo(() => {
    const p = projectionRow(theta, noise / 100)
    const q = filterProjection(p, TAU, win)
    return { p, q, db: spectrumDb(p), qMin: Math.min(...q) }
  }, [theta, win, noise])
  const filter = useMemo(() => filterCurve(win), [win])
  const stems = kernelStems(win)

  const draw = ({ ctx, width, height, colors }) => {
    const size = { width, height }
    const cells = layout(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawDial(ctx, size, colors, cells[0], theta)

    // 投影 p(s)
    let view = plotView(size, cells[1], [-1, 1], [-0.15, 0.65])
    drawPlotAxes(ctx, colors, view, { title: '投影 p(s)', xTicks: ticks([-1, 0, 1], 1), yTicks: ticks([0, 0.2, 0.4, 0.6], 0.2) })
    withClip(ctx, view, () => {
      drawZeroLine(ctx, colors, view)
      strokeSeries(ctx, view, S_AXIS, data.p, { color: colors.ink, width: 1.75 })
    })

    // 周波数成分 |P(w)|(dB)
    view = plotView(size, cells[2], [-1, 1], [-72, 4])
    drawPlotAxes(ctx, colors, view, { title: '|P(w)| [dB]', xTicks: ticks([-1, 0, 1], 1), yTicks: ticks([-60, -40, -20, 0], 20) })
    withClip(ctx, view, () => strokeSeries(ctx, view, OMEGA, data.db, { color: colors.ink, width: 1.75 }))

    // フィルタ |w|(点線)と、窓をかけたもの(太い線)
    view = plotView(size, cells[3], [-1, 1], [0, 1.05])
    drawPlotAxes(ctx, colors, view, { title: 'フィルタ |w|×窓', xTicks: ticks([-1, 0, 1], 1), yTicks: ticks([0, 0.5, 1], 0.5) })
    withClip(ctx, view, () => {
      strokeSeries(ctx, view, OMEGA, IDEAL_RAMP, { color: colors.muted, width: 1.25, dash: [4, 3] })
      strokeSeries(ctx, view, OMEGA, filter, { color: colors.ink, width: 2.25 })
    })

    // フィルタ後の投影 Q(s)
    view = plotView(size, cells[4], [-1, 1], [-3.5, 4])
    drawPlotAxes(ctx, colors, view, { title: 'フィルタ後 Q(s)', xTicks: ticks([-1, 0, 1], 1), yTicks: ticks([-2, 0, 2, 4], 2) })
    withClip(ctx, view, () => {
      drawZeroLine(ctx, colors, view)
      strokeSeries(ctx, view, S_AXIS, data.q, { color: `rgb(${colors.rgb['lane-1'].join(' ')})`, width: 2 })
    })

    // カーネル h(n)(棒。窓をかけたときは、Ram-Lak の値を白抜きの丸で)
    view = plotView(size, cells[5], [-7.8, 7.8], [-0.14, 0.29])
    const xs = cells[5].w - PLOT_MARGIN.left - PLOT_MARGIN.right < 150 ? [-4, 0, 4] : [-6, -4, -2, 0, 2, 4, 6]
    drawPlotAxes(ctx, colors, view, { title: 'カーネル h(n)τ²', xTicks: ticks(xs, 2), yTicks: ticks([-0.1, 0, 0.1, 0.2], 0.1) })
    withClip(ctx, view, () => {
      drawZeroLine(ctx, colors, view)
      ctx.strokeStyle = colors.ink
      ctx.fillStyle = colors.ink
      ctx.lineWidth = 1.5
      STEM_AXIS.forEach((n, i) => {
        ctx.beginPath()
        ctx.moveTo(view.sx(n), view.sy(0))
        ctx.lineTo(view.sx(n), view.sy(stems[i]))
        ctx.stroke()
        markerCircle(ctx, view.sx(n), view.sy(stems[i]), 3, { fill: colors.ink })
      })
      if (win !== 'ram-lak') {
        STEM_AXIS.forEach((n, i) => markerCircle(ctx, view.sx(n), view.sy(RAM_LAK_STEMS[i]), 3.5, { stroke: colors.muted, lineWidth: 1.25 }))
      }
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const stageWidth = useStageWidth(canvasRef)
  useEffect(() => { redraw() }, [theta, win, noise, data, redraw])

  const dialCell = () => layout(sizeRef.current.width, sizeRef.current.height)[0]
  const setFromPoint = (p) => {
    const g = dialGeometry(dialCell())
    setTheta(dialAngle(p.x - g.cx, -(p.y - g.cy)))
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => insideRect(dialGeometry(dialCell()).area, p),
    onDown: (p) => {
      if (!insideRect(dialGeometry(dialCell()).area, p)) return false
      canvasRef.current?.focus({ preventScroll: true })
      setFromPoint(p)
      return true
    },
    onMove: (p) => setFromPoint(p),
  })
  const onKeyDown = (event) => {
    const big = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setTheta((v) => clamp(v + big, 0, 179))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setTheta((v) => clamp(v - big, 0, 179))
    else if (event.key === 'Home') setTheta(0)
    else if (event.key === 'End') setTheta(179)
    else return
    event.preventDefault()
  }
  const reset = () => { setTheta(INITIAL.theta); setWin(INITIAL.win); setNoise(INITIAL.noise) }

  return (
    <SimShell
      label="ランプフィルタ"
      height={fixedHeight(stageHeight(stageWidth))}
      switcher={<ModeSwitch label="フィルタ" value={win} options={WINDOW_OPTIONS} onChange={setWin} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="模型を撮る向き θ の図と、その向きの投影 p(s)、周波数成分、フィルタ、フィルタ後の投影 Q(s)、カーネル h(n) のグラフ。模型の図の取っ手をドラッグするか、矢印キーで向きを 1° ずつ（Shift で 10° ずつ）変えられます。" />}
      legend={<SimLegend items={[
        { key: 'theta', symbol: '\\theta', label: '向き', value: `${theta}°`, minChars: 5 },
        { key: 'before', label: '投影 p(s)', swatch: 'var(--color-ink)' },
        { key: 'after', label: 'フィルタ後 Q(s)', swatch: 'var(--lane-1)' },
        { key: 'dip', symbol: 'Q_{\\min}', label: '最小値', value: fmt(data.qMin, 2), minChars: 6 },
        { key: 'w', symbol: 'w', label: '周波数の単位', value: '最大 = 1', minChars: 8 },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
        <ParamSlider symbol="\theta" label="投影の向き" value={theta} min={0} max={179} step={1} unit="°" onChange={setTheta} />
        <ParamSlider label="雑音" value={noise} min={0} max={10} step={1} unit="%" onChange={setNoise} />
      </>}
    />
  )
}
