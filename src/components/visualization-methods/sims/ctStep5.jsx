import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { PlayPauseButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, arrowStep, markerCircle } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN, projectPhantom, sampleSpectrumLine } from '../../../utils/vis/ct'
import { fft, fft2D } from '../../../utils/vis/fft'
import { drawSubLabel } from './labelKit'
import { deg, drawFrame, drawGrayImage, drawHaloText, drawPlotAxes, phantomValues, plotMap, rad, strokeHalo } from './ctKit'

const N = 128 // 断面の画素数(1 辺)
const TAU = 2 / N // 画素の間隔
const PAD = 512 // ゼロを詰めた配列の 1 辺。周波数の番号の間隔が 1/(PAD・τ) = 0.125 に細かくなり、斜めの線でも 2 次元の値を補間しやすい
const CROP = 128 // 絵にする周波数の範囲(中心から ±64 番 = ±8 周期/長さ)
const K_SHOW = CROP / 2 // 2 次元の線の上で値を取る番号の上限
const W_MAX = K_SHOW / (PAD * TAU) // グラフの横軸の上限(8)
const LINE_PAD = 2048 // 投影の 1 次元 FFT は、もっと細かく(線をなめらかに描く)
const LINE_STEP = LINE_PAD / PAD // 2 次元の番号 1 つぶんの、1 次元の番号の数
const DOT_EVERY = 2 // 点は番号 2 つおき(w = 0.25 おき)
const LOG_RANGE = [-3.2, -0.3] // 絵の灰色の窓(大きさの常用対数)
const Y_MAX = 0.55
const SPEED = rad(15) // 再生で線が回る速さ(15°/s)

// 断面(128 × 128)をゼロで 512 × 512 に広げて 2 次元 FFT し、大きさ(τ² 倍)の常用対数を中央 256 × 256 だけ絵にする。
// 一度だけ作る。ゼロ周波数は絵の中心。絵の右が +u、上が +v(画像の行は下へ y が減るので、v = −(行の番号))
let spectrum = null
function getSpectrum() {
  if (spectrum) return spectrum
  const img = phantomValues(SHEPP_LOGAN, N)
  const re = new Float64Array(PAD * PAD)
  const im = new Float64Array(PAD * PAD)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) re[j * PAD + i] = img[j * N + i]
  fft2D(re, im, PAD)
  const picture = new Float32Array(CROP * CROP)
  for (let r = 0; r < CROP; r++) {
    const j = (r - CROP / 2 + PAD) % PAD
    for (let c = 0; c < CROP; c++) {
      const i = (c - CROP / 2 + PAD) % PAD
      picture[r * CROP + c] = Math.log10(Math.max(TAU * TAU * Math.hypot(re[j * PAD + i], im[j * PAD + i]), 1e-6))
    }
  }
  spectrum = { re, im, picture }
  return spectrum
}

// 向き θ の投影 p_θ(s_m)(m = 0..N−1、残りは 0)の 1 次元 FFT の大きさ(τ 倍)。LINE_PAD 点の FFT なので、番号 j の周波数は
// w = j/(LINE_PAD・τ)。2 次元の番号 k とは j = k・LINE_STEP で同じ周波数になる
function projectionSpectrum(theta) {
  const re = new Float64Array(LINE_PAD)
  const im = new Float64Array(LINE_PAD)
  for (let m = 0; m < N; m++) re[m] = projectPhantom(SHEPP_LOGAN, -1 + (m + 0.5) * TAU, theta)
  fft(re, im)
  return Float64Array.from({ length: K_SHOW * LINE_STEP + 1 }, (_, j) => TAU * Math.hypot(re[j], im[j]))
}

function layoutOf(width, height) {
  const pad = 10
  if (width >= 440) {
    const side = Math.min(height - 2 * pad - 6, width * 0.42)
    const image = { x: pad, y: (height - side) / 2, w: side, h: side }
    const left = image.x + side + 52
    return { image, plot: { x: left, y: 36, w: Math.max(80, width - left - 26), h: height - 36 - 42 } }
  }
  const plotH = Math.min(120, Math.max(80, height * 0.3))
  const side = Math.min(width - 2 * pad, height - plotH - 36 - 44 - pad)
  const image = { x: (width - side) / 2, y: pad, w: side, h: side }
  const top = image.y + side + 36
  return { image, plot: { x: 52, y: top, w: width - 52 - 26, h: Math.max(60, height - top - 38) } }
}

export default function CtStep5() {
  const [theta, setTheta] = useState(rad(30))
  const legendRef = useRef(null)
  const thetaRef = useRef(theta)
  thetaRef.current = theta
  const grabRef = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = { theta }

  const draw = ({ ctx, width, height, colors }) => {
    const { theta: th } = stateRef.current
    const { image, plot } = layoutOf(width, height)
    const { re, im, picture } = getSpectrum()
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 断面の 2 次元フーリエ変換の大きさ(対数)と、原点を通る向き θ の線
    drawGrayImage(ctx, colors, picture, CROP, CROP, image, { min: LOG_RANGE[0], max: LOG_RANGE[1] })
    drawFrame(ctx, colors, image)
    const cx = image.x + image.w / 2
    const cy = image.y + image.h / 2
    const R = image.w / 2 - 1
    const c = Math.cos(th)
    const s = Math.sin(th)
    ctx.save()
    ctx.beginPath()
    ctx.rect(image.x, image.y, image.w, image.h)
    ctx.clip()
    ctx.strokeStyle = colors.alpha('muted', 0.8)
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    strokeHalo(ctx, colors, [[cx - R * c, cy + R * s], [cx + R * c, cy - R * s]], { color: colors.alpha('lane-1', 1), width: 2 })
    const values2d = sampleSpectrumLine(re, im, PAD, th, K_SHOW + 1)
    for (let k = 0; k <= K_SHOW; k += DOT_EVERY) {
      markerCircle(ctx, cx + ((k / K_SHOW) * R) * c, cy - ((k / K_SHOW) * R) * s, 2.5, { fill: colors.alpha('lane-3', 1), stroke: colors.surface, lineWidth: 1 })
    }
    for (const sign of [1, -1]) markerCircle(ctx, cx + sign * R * c, cy - sign * R * s, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 2 })
    drawHaloText(ctx, colors, '周波数の画像（対数）', image.x + 6, image.y + 5)
    drawHaloText(ctx, colors, 'u', image.x + image.w - 6, cy - 4, { align: 'right', baseline: 'bottom' })
    drawHaloText(ctx, colors, 'v', cx + 5, image.y + 5 + 16)

    // 投影の 1 次元 FFT の大きさ(線)と、2 次元 FFT のその線の上の値(点)
    const map = plotMap(plot, [0, W_MAX], [0, Y_MAX])
    drawPlotAxes(ctx, colors, map, {
      xTicks: [0, 2, 4, 6, 8].map((v) => ({ v, label: `${v}` })),
      yTicks: (plot.h >= 140 ? [0, 0.1, 0.2, 0.3, 0.4, 0.5] : [0, 0.25, 0.5]).map((v) => ({ v, label: `${v}` })),
      xName: 'w',
    })
    drawSubLabel(ctx, '|P_θ(w)|', plot.x, plot.y - 10, { color: colors.ink, size: 12 })
    const values1d = projectionSpectrum(th)
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.x, plot.y - 2, plot.w, plot.h + 4)
    ctx.clip()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    values1d.forEach((value, j) => {
      const x = map.px((j / (K_SHOW * LINE_STEP)) * W_MAX)
      const y = map.py(value)
      if (j === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    for (let k = 0; k <= K_SHOW; k += DOT_EVERY) {
      markerCircle(ctx, map.px((k / K_SHOW) * W_MAX), map.py(TAU * TAU * values2d[k]), 3, { fill: colors.alpha('lane-3', 1), stroke: colors.surface, lineWidth: 1 })
    }
    ctx.restore()
    legendRef.current?.update({ theta: `${deg(th).toFixed(0)}°` })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const loop = useSimLoop((dt) => {
    const next = (thetaRef.current + dt * SPEED) % Math.PI
    thetaRef.current = next
    setTheta(next)
  }, { targetRef: canvasRef })

  const geometry = () => {
    const { width, height } = sizeRef.current
    const { image } = layoutOf(width, height)
    return { cx: image.x + image.w / 2, cy: image.y + image.h / 2, R: image.w / 2 - 1 }
  }
  const hit = (p) => {
    const { cx, cy, R } = geometry()
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    return [1, -1].some((sign) => Math.hypot(p.x - (cx + sign * R * c), p.y - (cy - sign * R * s)) <= 7 + GRAB_SLOP_PX)
  }
  const turnTo = (p) => {
    const { cx, cy } = geometry()
    if (Math.hypot(p.x - cx, p.y - cy) < 12) return
    const angle = Math.atan2(-(p.y - cy), p.x - cx)
    const next = ((angle % Math.PI) + Math.PI) % Math.PI
    thetaRef.current = next
    setTheta(next)
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (p) => {
      if (!hit(p)) return false
      loop.pause()
      grabRef.current = true
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも回せるように
      return true
    },
    onMove: (p) => grabRef.current && turnTo(p),
    onUp: () => { grabRef.current = false },
  })
  const scrub = (degrees) => {
    loop.pause()
    const next = ((rad(degrees) % Math.PI) + Math.PI) % Math.PI
    thetaRef.current = next
    setTheta(next)
  }
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    scrub(Math.round(deg(thetaRef.current)) + (step.dx + step.dy))
  }

  return (
    <SimShell
      label="中央断面定理"
      height={{ phone: [420, 470], pc: [300, 380] }}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="断面の 2 次元フーリエ変換の大きさ(対数)と、その中心を通る向き θ の線。線の端の丸をドラッグするか、矢印キーで θ を変えます（Shift で大きく）。グラフは、向き θ の投影の 1 次元フーリエ変換の大きさ(線)と、2 次元のフーリエ変換のその線に沿った値(点)で、重なります。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'theta', symbol: '\\theta', label: '線の向き', value: '0°', minChars: 5 },
        { key: 'one', symbol: '|P_\\theta(w)|', label: '投影の 1 次元 FFT', swatch: 'var(--color-ink)' },
        { key: 'two', symbol: '|F(w\\cos\\theta,\\ w\\sin\\theta)|', label: '2 次元 FFT のその線に沿った値', swatch: 'var(--lane-3)' },
      ]} />}
      controls={<>
        <SimToolbar><PlayPauseButton running={loop.running} onToggle={loop.toggle} /></SimToolbar>
        <ParamSlider symbol="\theta" label="線の向き" unit="°" value={Math.round(deg(theta))} min={0} max={179} step={1} onChange={scrub} format={(v) => v.toFixed(0)} />
      </>}
    />
  )
}
