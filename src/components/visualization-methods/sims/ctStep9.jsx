import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { LAPLACIAN4, LAPLACIAN8, SOBEL_X, SOBEL_Y, convolve3x3, difference1D, sharpen } from '../../../utils/vis/imageFilter'
import {
  GRID_CELL_H, GRID_CELL_W, SLICE_N, SLICE_WINDOW, drawGrayImage, drawLens, drawNumberGrid, drawPlotAxes, fixedHeight, insideRect,
  neighborhood, plotView, sliceImage, strokeSeries, ticks, useGraySwatch, useStageWidth, withClip, drawZeroLine,
} from './ctFilterKit'

const N = SLICE_N
const PAD = 6
const GAP = 8
const TITLE_H = 18
const PLOT_H = 118
const READOUT_H = 128 // 狭いときの、画像の下の欄の高さ
const WIDE_FROM = 600
const SIGNAL_N = 31
const KERNELS = [
  { value: 'l4', label: '4 近傍', kernel: LAPLACIAN4, laplacian: 'l4' },
  { value: 'l8', label: '8 近傍', kernel: LAPLACIAN8, laplacian: 'l8' },
  { value: 'sx', label: 'ソーベル x', kernel: SOBEL_X, laplacian: 'l4' },
  { value: 'sy', label: 'ソーベル y', kernel: SOBEL_Y, laplacian: 'l4' },
]
const kernelOf = (key) => KERNELS.find((k) => k.value === key)
const paren = (v) => (v < -0.005 ? `(${fmt(v, 2)})` : fmt(v, 2))
const INITIAL = { k: 0.5, kernel: 'l4', lens: [10, 32] }
// 1 次元のぼけた段差(0 → 1。2 画素ほどで変わる)。2 回の差分は 1 つ手前で正、1 つ先で負になる
const SIGNAL_INITIAL = Float64Array.from({ length: SIGNAL_N }, (_, i) => 0.5 + 0.5 * Math.tanh((i - 15) / 0.7))
// 1 次元のラプラシアン(f(i+1) − 2f(i) + f(i−1))。高さ 1 の画像として sharpen に渡す
const LAPLACIAN_1D = [0, 0, 0, 1, -2, 1, 0, 0, 0]

// 断面(段階 8 と同じ作り直した画像)の輪郭の絵。符号のある値なので、0 が灰色の真ん中になるよう、絶対値の最大で伸ばす
const edgeCache = new Map()
function edgeImage(key) {
  if (!edgeCache.has(key)) {
    const img = convolve3x3(sliceImage(), N, N, kernelOf(key).kernel)
    let max = 1e-6
    for (const v of img) max = Math.max(max, Math.abs(v))
    edgeCache.set(key, { img, max })
  }
  return edgeCache.get(key)
}

// 3 つの画像の割り付け(幅 width だけで決まる)。狭いときは 3 つを横に並べて欄を下に、広いときは 3 つと欄を横に並べる
function layout(width) {
  const half = (width - 2 * PAD - GAP) / 2
  const plots = [{ x: PAD, y: PAD, w: half, h: PLOT_H }, { x: PAD + half + GAP, y: PAD, w: half, h: PLOT_H }]
  const top = PAD + PLOT_H + GAP
  if (width < WIDE_FROM) {
    const cell = (width - 2 * PAD - 2 * GAP) / 3
    const side = Math.floor(cell) - 2
    const images = [0, 1, 2].map((i) => ({ x: Math.round(PAD + i * (cell + GAP) + (cell - side) / 2), y: top + TITLE_H, w: side, h: side }))
    const readout = { x: PAD, y: top + TITLE_H + side + GAP, w: width - 2 * PAD, h: READOUT_H }
    return { plots, images, readout, titleY: top + 12, height: readout.y + READOUT_H + PAD }
  }
  const side = clamp(Math.floor((width - 2 * PAD - 3 * GAP - 214) / 3), 100, 200)
  const images = [0, 1, 2].map((i) => ({ x: PAD + i * (side + GAP), y: top + TITLE_H, w: side, h: side }))
  const left = PAD + 3 * (side + GAP) + 6
  const readout = { x: left, y: top + TITLE_H, w: width - PAD - left, h: side }
  return { plots, images, readout, titleY: top + 12, height: top + TITLE_H + Math.max(side, 134) + PAD }
}

const SIGNAL_X = Array.from({ length: SIGNAL_N }, (_, i) => i)
const viewsFor = (size, L) => [
  plotView(size, L.plots[0], [-0.6, SIGNAL_N - 0.4], [-0.45, 1.45]),
  plotView(size, L.plots[1], [-0.6, SIGNAL_N - 0.4], [-0.55, 0.55]),
]

function drawDots(ctx, view, ys, color, r = 2.2) {
  ctx.save()
  ctx.fillStyle = color
  ys.forEach((v, i) => { ctx.beginPath(); ctx.arc(view.sx(i), view.sy(v), r, 0, Math.PI * 2); ctx.fill() })
  ctx.restore()
}

// 虫めがねの欄: 3 × 3 の重みと値、出力の計算
function drawReadout(ctx, colors, rect, info) {
  const gridW = 3 * GRID_CELL_W
  drawText(ctx, '重み w', rect.x, rect.y + 11, { color: colors.ink, size: 12 })
  drawText(ctx, '値 f', rect.x + gridW + 18, rect.y + 11, { color: colors.ink, size: 12 })
  drawNumberGrid(ctx, colors, rect.x, rect.y + 20, info.weights, 3, { format: (v) => fmt(v, 0), center: 4 })
  drawNumberGrid(ctx, colors, rect.x + gridW + 18, rect.y + 20, info.values, 3, { format: (v) => fmt(v, 2), center: 4 })
  let y = rect.y + 20 + 3 * GRID_CELL_H + 15
  for (const line of info.lines) {
    drawText(ctx, line, rect.x, y, { color: colors.ink, size: 11 })
    y += 15
  }
}

export default function CtStep9() {
  const [signal, setSignal] = useState(SIGNAL_INITIAL)
  const [selected, setSelected] = useState(14)
  const [k, setK] = useState(INITIAL.k)
  const [kernel, setKernel] = useState(INITIAL.kernel)
  const [lens, setLens] = useState(INITIAL.lens)
  const dragRef = useRef(null)
  const base = sliceImage()
  const swatch = useGraySwatch()
  // 1 次元: 1 回の差分、2 回の差分、g = f − k f″
  const diff1 = useMemo(() => difference1D(signal, 1), [signal])
  const diff2 = useMemo(() => difference1D(signal, 2), [signal])
  const sharp1D = useMemo(() => sharpen(signal, SIGNAL_N, 1, k, LAPLACIAN_1D), [signal, k])
  // 画像: 輪郭の絵(選んだ重み)、鮮鋭化(ラプラシアン)
  const edge = edgeImage(kernel)
  const sharpKey = kernelOf(kernel).laplacian
  const lap = useMemo(() => convolve3x3(base, N, N, kernelOf(sharpKey).kernel), [base, sharpKey])
  const sharpImg = useMemo(() => sharpen(base, N, N, k, kernelOf(sharpKey).kernel), [base, k, sharpKey])

  const readoutInfo = () => {
    const [cx, cy] = lens
    const idx = cy * N + cx
    const f = base[idx]
    const lines = [`Σ w·f = ${fmt(edge.img[idx], 2)}`]
    const times = `${fmt(f, 2)} − ${k.toFixed(2)}×${paren(lap[idx])} = ${fmt(sharpImg[idx], 2)}`
    if (kernelOf(kernel).laplacian === kernel) lines.push('g = f − k·Σ w·f', `= ${times}`)
    else lines.push(`鮮鋭化は ${kernelOf(sharpKey).label} で行う`, `g = ${times}`)
    return { weights: kernelOf(kernel).kernel, values: neighborhood(base, N, N, cx, cy, 1), lines }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const size = { width, height }
    const L = layout(width)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const [viewA, viewB] = viewsFor(size, L)
    // 1 次元: f と g
    drawPlotAxes(ctx, colors, viewA, { title: 'f と g', xTicks: ticks([0, 10, 20, 30], 10), yTicks: ticks([0, 0.5, 1], 0.5) })
    withClip(ctx, viewA, () => {
      strokeSeries(ctx, viewA, SIGNAL_X, signal, { color: colors.ink, width: 1.5 })
      strokeSeries(ctx, viewA, SIGNAL_X, sharp1D, { color: laneColor(colors, 1), width: 2 })
      drawDots(ctx, viewA, sharp1D, laneColor(colors, 1), 2)
      signal.forEach((v, i) => markerCircle(ctx, viewA.sx(i), viewA.sy(v), i === selected ? 4.5 : 2.8, { fill: colors.ink, stroke: i === selected ? colors.surface : undefined, lineWidth: 1.5 }))
    })
    // 1 次元: 1 回の差分と 2 回の差分
    drawPlotAxes(ctx, colors, viewB, { title: '差分', xTicks: ticks([0, 10, 20, 30], 10), yTicks: ticks([-0.4, 0, 0.4], 0.4) })
    withClip(ctx, viewB, () => {
      drawZeroLine(ctx, colors, viewB)
      strokeSeries(ctx, viewB, SIGNAL_X, diff1, { color: laneColor(colors, 3), width: 2 })
      strokeSeries(ctx, viewB, SIGNAL_X, diff2, { color: laneColor(colors, 4), width: 2 })
      drawDots(ctx, viewB, diff1, laneColor(colors, 3))
      drawDots(ctx, viewB, diff2, laneColor(colors, 4))
    })

    // 画像: 断面 f、輪郭の絵、鮮鋭化した断面
    const [lo, hi] = SLICE_WINDOW
    const r = 1
    const [imgF, imgEdge, imgG] = L.images
    const smooth = imgF.w / N < 2.2 // 小さく見せるときは、画素の境をぼかして、そろわない画素の大きさが目立たないようにする
    drawGrayImage(ctx, colors, base, N, N, imgF, { lo, hi, smooth })
    drawGrayImage(ctx, colors, edge.img, N, N, imgEdge, { lo: -edge.max, hi: edge.max, smooth })
    drawGrayImage(ctx, colors, sharpImg, N, N, imgG, { lo, hi, smooth })
    for (const rect of L.images) drawLens(ctx, colors, rect, N, N, lens[0], lens[1], r)
    drawText(ctx, '断面 f', imgF.x, L.titleY, { color: colors.ink, size: 12 })
    drawText(ctx, '輪郭', imgEdge.x, L.titleY, { color: colors.ink, size: 12 })
    drawText(ctx, '鮮鋭化 g', imgG.x, L.titleY, { color: colors.ink, size: 12 })
    drawReadout(ctx, colors, L.readout, readoutInfo())
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const width = useStageWidth(canvasRef)
  useEffect(() => { redraw() }, [signal, selected, k, kernel, lens, sharp1D, sharpImg, edge, redraw])

  const layoutNow = () => layout(sizeRef.current.width)
  const pixelAt = (rect, p) => [clamp(Math.floor(((p.x - rect.x) / rect.w) * N), 0, N - 1), clamp(Math.floor(((p.y - rect.y) / rect.h) * N), 0, N - 1)]
  const viewA = () => viewsFor(sizeRef.current, layoutNow())[0]
  const setSampleFromY = (i, y) => {
    const view = viewA()
    setSignal((current) => Float64Array.from(current, (v, j) => (j === i ? clamp(view.wy(y), -0.2, 1.2) : v)))
  }
  const targetAt = (p) => {
    const L = layoutNow()
    const frame = viewA().frame
    if (insideRect({ x: frame.left, y: frame.top, w: frame.width, h: frame.height }, p, 10)) return { kind: 'signal' }
    const rect = L.images.find((r) => insideRect(r, p))
    return rect ? { kind: 'lens', rect } : null
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => targetAt(p) !== null,
    onDown: (p) => {
      const target = targetAt(p)
      if (!target) return false
      canvasRef.current?.focus({ preventScroll: true })
      if (target.kind === 'signal') {
        const i = clamp(Math.round(viewA().wx(p.x)), 0, SIGNAL_N - 1)
        dragRef.current = { kind: 'signal', i }
        setSelected(i)
        setSampleFromY(i, p.y)
      } else {
        dragRef.current = target
        setLens(pixelAt(target.rect, p))
      }
      return true
    },
    onMove: (p) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'signal') setSampleFromY(drag.i, p.y)
      else setLens(pixelAt(drag.rect, p))
    },
    onUp: () => { dragRef.current = null },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (step) {
      event.preventDefault()
      setLens(([x, y]) => [clamp(x + step.dx, 0, N - 1), clamp(y - step.dy, 0, N - 1)])
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setSelected((i) => clamp(i + (event.key === 'End' ? 1 : -1), 0, SIGNAL_N - 1))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      setSignal((current) => Float64Array.from(current, (v, j) => (j === selected ? clamp(v + (event.key === 'PageUp' ? 0.05 : -0.05), -0.2, 1.2) : v)))
    }
  }
  const reset = () => { setSignal(SIGNAL_INITIAL); setSelected(14); setK(INITIAL.k); setKernel(INITIAL.kernel); setLens(INITIAL.lens) }

  return (
    <SimShell
      label="輪郭を強める"
      height={fixedHeight(layout(width).height)}
      switcher={<ModeSwitch label="輪郭の重み" value={kernel} options={KERNELS} onChange={setKernel} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="1 次元のぼけた段差の点を上下にドラッグすると、1 回の差分、2 回の差分、鮮鋭化した線が変わります。断面の画像の上をドラッグするか矢印キーを押すと虫めがねの枠が動き、枠の中の 3 × 3 の重みと値から輪郭の値と鮮鋭化の値が計算されます。Home と End で段差の点を選び、PageUp と PageDown で値を変えられます。" />}
      legend={<SimLegend items={[
        { key: 'f', symbol: 'f', label: 'ぼけた段差', swatch: 'var(--color-ink)' },
        { key: 'g', symbol: 'g', label: '鮮鋭化', swatch: 'var(--lane-1)' },
        { key: 'd1', symbol: 'f^{\\prime}', label: '1 回の差分', swatch: 'var(--lane-3)' },
        { key: 'd2', symbol: 'f^{\\prime\\prime}', label: '2 回の差分', swatch: 'var(--lane-4)' },
        { key: 'ramp', label: '輪郭の値', value: '負 → 正', swatch },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
        <ParamSlider symbol="k" label="鮮鋭化の強さ" value={k} min={0} max={1} step={0.05} onChange={setK} format={(v) => v.toFixed(2)} />
      </>}
    />
  )
}
