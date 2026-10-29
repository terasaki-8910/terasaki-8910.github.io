import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { seededRandom } from '../../../utils/vis/ct'
import { NAGAO_REGIONS, addImpulseNoise, boxBlur, centerWeighted3x3, edgePreservingSmooth, median, median1D, movingAverage1D } from '../../../utils/vis/imageFilter'
import {
  GRID_CELL_H, GRID_CELL_W, SLICE_N, SLICE_WINDOW, drawGrayImage, drawLens, drawNumberGrid, drawPlotAxes, fixedHeight, gaussianGrain,
  insideRect, neighborhood, plotView, sliceImage, strokeSeries, ticks, useGraySwatch, useStageWidth, withClip,
} from './ctFilterKit'

const N = SLICE_N
const PAD = 6
const GAP = 8
const TITLE_H = 18
const PLOT_H = 138
const READOUT_H = 112 // 狭いときの、画像の下の欄の高さ(5 × 5 の格子の右に文字が入る幅があるとき)
const READOUT_H_TIGHT = 172 // 幅が足りず、文字を格子の下に置くとき
const WIDE_FROM = 600 // この幅から、画像と欄を横に並べる
const SIGNAL_N = 36
const SPIKES = [[6, 0.5], [12, -0.45], [26, 0.55], [31, -0.5]] // 飛び離れた値の位置と大きさ
const SIGNAL_RANGE = [-0.35, 1.45]
const FILTERS = [
  { value: 'box', label: '移動平均' },
  { value: 'center', label: '中央を重く' },
  { value: 'median', label: 'メディアン' },
  { value: 'edge', label: 'エッジ保存' },
]
const INITIAL = { n: 5, filter: 'median', rate: 4, lens: [10, 32] }

// 1 次元の信号の見本: 段差(0.25 → 0.75)に、細かい乱れと、飛び離れた値 4 つ
const SIGNAL_INITIAL = (() => {
  const rand = seededRandom(4)
  const s = new Float64Array(SIGNAL_N)
  for (let i = 0; i < SIGNAL_N; i++) s[i] = (i < 18 ? 0.25 : 0.75) + (rand() - 0.5) * 0.05
  for (const [i, d] of SPIKES) s[i] += d
  return s
})()

// 画像の見本: 作り直した断面に、細かい乱れ(標準偏差 0.03)を足し、そこに rate の割合の画素を 0 か 1 にする(ごま塩)。
// 割合を増やしても、すでに変わった画素は変わらないように、画素ごとの乱数は 1 度だけ決める
let grainCache = null
let streamCache = null
function noisyImage(rate) {
  if (!grainCache) grainCache = gaussianGrain(sliceImage(), 0.03, 1)
  if (rate <= 0) return grainCache
  if (!streamCache) {
    const rand = seededRandom(2)
    streamCache = { u1: new Float64Array(N * N), u2: new Float64Array(N * N) }
    for (let i = 0; i < N * N; i++) { streamCache.u1[i] = rand(); streamCache.u2[i] = rand() }
  }
  // addImpulseNoise は、画素ごとに 1 つ(変えるなら続けてもう 1 つ)の乱数を取る。その順に、決めておいた値を渡す
  const { u1, u2 } = streamCache
  let p = 0
  let second = false
  const next = () => {
    if (second) { second = false; return u2[p++] }
    const v = u1[p]
    if (v < rate) second = true
    else p++
    return v
  }
  return addImpulseNoise(grainCache, rate, next, 0, 1)
}

function applyFilter(filter, img) {
  if (filter === 'box') return boxBlur(img, N, N, 3)
  if (filter === 'center') return centerWeighted3x3(img, N, N)
  if (filter === 'median') return median(img, N, N, 3)
  return edgePreservingSmooth(img, N, N)
}

// エッジ保存平滑化で選ばれる領域(5 × 5 の中の番号)。分散がいちばん小さい領域で、同じなら先のもの(edgePreservingSmooth と同じ)
function edgeRegion(values5) {
  let best = Infinity
  let pick = 0
  let variance = 0
  NAGAO_REGIONS.forEach((region, k) => {
    let s = 0
    let s2 = 0
    for (const [dx, dy] of region) { const v = values5[(dy + 2) * 5 + dx + 2]; s += v; s2 += v * v }
    const mean = s / region.length
    const v = s2 / region.length - mean * mean
    if (v < best - 1e-12) { best = v; pick = k; variance = v }
  })
  return { cells: NAGAO_REGIONS[pick].map(([dx, dy]) => (dy + 2) * 5 + dx + 2), variance }
}

// 虫めがねの欄の中身: 近傍の値と、出力の計算の文字
function readoutFor(filter, noisy, out, cx, cy) {
  const two = (v) => v.toFixed(2)
  if (filter === 'edge') {
    const values = neighborhood(noisy, N, N, cx, cy, 2)
    const region = edgeRegion(values)
    return { header: '5 × 5 の値', cols: 5, values, region: region.cells, lines: ['9 つの領域のうち、', `分散が最小の領域: ${region.variance.toFixed(4)}`, `その平均 = ${two(out)}`] }
  }
  const values = neighborhood(noisy, N, N, cx, cy, 1)
  const sum = values.reduce((s, v) => s + v, 0)
  if (filter === 'box') return { header: '3 × 3 の値', cols: 3, values, lines: ['9 つの値の平均', `${two(sum)} ÷ 9`, `= ${two(out)}`] }
  if (filter === 'center') {
    const around = sum - values[4]
    return { header: '3 × 3 の値', cols: 3, values, lines: ['中央 0.2、まわり 0.1 の重み', `0.2×${two(values[4])} + 0.1×${two(around)}`, `= ${two(out)}`] }
  }
  return { header: '3 × 3 の値', cols: 3, values, sorted: [...values].sort((a, b) => a - b), lines: ['小さい順に並べる', null, `真ん中 = ${two(out)}`] }
}

// 絵の割り付け(幅 width だけで決まる)。狭いとき: 信号 → 画像 2 つ → 欄。広いとき: 信号 → (画像 2 つと欄を横に)
function layout(width) {
  const plot = { x: PAD, y: PAD, w: width - 2 * PAD, h: PLOT_H }
  const top = PAD + PLOT_H + GAP
  if (width < WIDE_FROM) {
    const side = Math.floor((width - 2 * PAD - GAP) / 2) - 2
    const imgIn = { x: PAD, y: top + TITLE_H, w: side, h: side }
    const imgOut = { x: width - PAD - side, y: top + TITLE_H, w: side, h: side }
    const readoutH = width - 2 * PAD - 5 * GRID_CELL_W - 16 >= 150 ? READOUT_H : READOUT_H_TIGHT
    const readout = { x: PAD, y: top + TITLE_H + side + GAP, w: width - 2 * PAD, h: readoutH }
    return { plot, imgIn, imgOut, readout, titleY: top + 12, height: readout.y + readoutH + PAD }
  }
  const side = clamp(Math.floor((width - 2 * PAD - GAP - 22 - 236) / 2), 120, 224)
  const imgIn = { x: PAD, y: top + TITLE_H, w: side, h: side }
  const imgOut = { x: PAD + side + GAP, y: top + TITLE_H, w: side, h: side }
  const left = imgOut.x + side + 14
  const readout = { x: left, y: top + TITLE_H, w: width - PAD - left, h: side }
  return { plot, imgIn, imgOut, readout, titleY: top + 12, height: top + TITLE_H + side + PAD }
}

const plotViewFor = (size, plot) => plotView(size, plot, [-0.6, SIGNAL_N - 0.4], SIGNAL_RANGE)

// 虫めがねの欄: 見出し、数の格子、計算の文字(格子の右が広ければ右、狭ければ下)
function drawReadout(ctx, colors, rect, info) {
  const gridW = info.cols * GRID_CELL_W
  const gridH = (info.values.length / info.cols) * GRID_CELL_H
  drawText(ctx, info.header, rect.x, rect.y + 11, { color: colors.ink, size: 12 })
  const gx = rect.x
  const gy = rect.y + 20
  drawNumberGrid(ctx, colors, gx, gy, info.values, info.cols, { format: (v) => fmt(v, 2), region: info.region, center: (info.values.length - 1) / 2 })
  const right = rect.w - gridW - 16 >= 150
  const px = right ? gx + gridW + 16 : gx
  const pw = right ? rect.w - gridW - 16 : rect.w
  let y = right ? gy + 6 : gy + gridH + 14
  for (const line of info.lines) {
    if (line === null) {
      // 並べ替えた値(真ん中だけ ink の塗り)
      const perRow = Math.ceil(9 / Math.ceil(9 / Math.max(1, Math.floor(pw / (GRID_CELL_W + 1)))))
      info.sorted.forEach((v, i) => {
        const x = px + (i % perRow) * (GRID_CELL_W + 1)
        const yy = y - 6 + Math.floor(i / perRow) * (GRID_CELL_H + 2)
        if (i === 4) {
          ctx.fillStyle = colors.ink
          ctx.fillRect(x, yy, GRID_CELL_W, GRID_CELL_H)
        } else {
          ctx.strokeStyle = colors.muted
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, yy + 0.5, GRID_CELL_W - 1, GRID_CELL_H - 1)
        }
        drawText(ctx, fmt(v, 2), x + GRID_CELL_W / 2, yy + GRID_CELL_H / 2 + 0.5, { color: i === 4 ? colors.surface : colors.ink, size: 11, align: 'center', baseline: 'middle' })
      })
      y += Math.ceil(9 / perRow) * (GRID_CELL_H + 2) + 4
    } else {
      drawText(ctx, line, px, y + 4, { color: colors.ink, size: 11 })
      y += 16
    }
  }
}

export default function CtStep8() {
  const [signal, setSignal] = useState(SIGNAL_INITIAL)
  const [selected, setSelected] = useState(6)
  const [n, setN] = useState(INITIAL.n)
  const [filter, setFilter] = useState(INITIAL.filter)
  const [rate, setRate] = useState(INITIAL.rate)
  const [lens, setLens] = useState(INITIAL.lens)
  const [target, setTarget] = useState('lens') // キーで動かす物: 'lens'(虫めがね)か 'signal'(信号の点)
  const dragRef = useRef(null)
  const ma = useMemo(() => movingAverage1D(signal, n), [signal, n])
  const md = useMemo(() => median1D(signal, n), [signal, n])
  const noisy = useMemo(() => noisyImage(rate / 100), [rate])
  const filtered = useMemo(() => applyFilter(filter, noisy), [filter, noisy])
  const swatch = useGraySwatch()

  const draw = ({ ctx, width, height, colors }) => {
    const size = { width, height }
    const L = layout(width)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 1 次元の信号: 元の点と、移動平均、メディアン
    const view = plotViewFor(size, L.plot)
    drawPlotAxes(ctx, colors, view, { title: '1 次元の信号', xTicks: ticks([0, 10, 20, 30], 10), yTicks: ticks([0, 0.5, 1], 0.5) })
    const xs = Array.from({ length: SIGNAL_N }, (_, i) => i)
    withClip(ctx, view, () => {
      strokeSeries(ctx, view, xs, signal, { color: colors.alpha('ink', 0.35), width: 1 })
      strokeSeries(ctx, view, xs, ma, { color: laneColor(colors, 1), width: 2 })
      strokeSeries(ctx, view, xs, md, { color: laneColor(colors, 3), width: 2 })
      signal.forEach((v, i) => markerCircle(ctx, view.sx(i), view.sy(v), i === selected ? 4.5 : 3, { fill: colors.ink, stroke: i === selected ? colors.surface : undefined, lineWidth: 1.5 }))
      // キーで信号の点を動かすときは、選んでいる点を太い輪で囲む
      if (target === 'signal') markerCircle(ctx, view.sx(selected), view.sy(signal[selected]), 8, { stroke: colors.ink, lineWidth: 3 })
    })

    // 画像: 雑音の入った断面と、フィルタをかけた断面(同じ所に虫めがねの枠)
    const r = filter === 'edge' ? 2 : 1
    const smooth = L.imgIn.w / N < 2.2 // 小さく見せるときは、画素の境をぼかして、そろわない画素の大きさが目立たないようにする
    drawGrayImage(ctx, colors, noisy, N, N, L.imgIn, { lo: SLICE_WINDOW[0], hi: SLICE_WINDOW[1], smooth })
    drawGrayImage(ctx, colors, filtered, N, N, L.imgOut, { lo: SLICE_WINDOW[0], hi: SLICE_WINDOW[1], smooth })
    drawLens(ctx, colors, L.imgIn, N, N, lens[0], lens[1], r, { selected: target === 'lens' })
    drawLens(ctx, colors, L.imgOut, N, N, lens[0], lens[1], r, { selected: target === 'lens' })
    drawText(ctx, '雑音の入った断面', L.imgIn.x, L.titleY, { color: colors.ink, size: 12 })
    drawText(ctx, FILTERS.find((f) => f.value === filter).label, L.imgOut.x, L.titleY, { color: colors.ink, size: 12 })
    drawReadout(ctx, colors, L.readout, readoutFor(filter, noisy, filtered[lens[1] * N + lens[0]], lens[0], lens[1]))
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const width = useStageWidth(canvasRef)
  useEffect(() => { redraw() }, [signal, selected, target, ma, md, noisy, filtered, filter, lens, redraw])

  const layoutNow = () => layout(sizeRef.current.width)
  const pixelAt = (rect, p) => [clamp(Math.floor(((p.x - rect.x) / rect.w) * N), 0, N - 1), clamp(Math.floor(((p.y - rect.y) / rect.h) * N), 0, N - 1)]
  const setSampleFromY = (i, y) => {
    const view = plotViewFor(sizeRef.current, layoutNow().plot)
    setSignal((current) => Float64Array.from(current, (v, k) => (k === i ? clamp(view.wy(y), SIGNAL_RANGE[0] + 0.05, SIGNAL_RANGE[1] - 0.05) : v)))
  }
  const targetAt = (p) => {
    const L = layoutNow()
    const frame = plotViewFor(sizeRef.current, L.plot).frame
    if (insideRect({ x: frame.left, y: frame.top, w: frame.width, h: frame.height }, p, 10)) return { kind: 'signal' }
    if (insideRect(L.imgIn, p)) return { kind: 'lens', rect: L.imgIn }
    if (insideRect(L.imgOut, p)) return { kind: 'lens', rect: L.imgOut }
    return null
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => targetAt(p) !== null,
    onDown: (p) => {
      const target = targetAt(p)
      if (!target) return false
      canvasRef.current?.focus({ preventScroll: true })
      if (target.kind === 'signal') {
        const view = plotViewFor(sizeRef.current, layoutNow().plot)
        const i = clamp(Math.round(view.wx(p.x)), 0, SIGNAL_N - 1)
        dragRef.current = { kind: 'signal', i }
        setSelected(i)
        setTarget('signal')
        setSampleFromY(i, p.y)
      } else {
        dragRef.current = target
        setTarget('lens')
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
  // PageUp・PageDown で、キーで動かす物を「虫めがね」と「信号の点」で切り替える。矢印キーは、虫めがねなら枠を 1 画素ずつ、
  // 信号の点なら左右で隣の点を選び、上下で値を変える(Shift で 5 倍)。Home・End は最初・最後の点。Alt・Ctrl・Cmd つきは使わない
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      setTarget((value) => (value === 'lens' ? 'signal' : 'lens'))
      return
    }
    if (target === 'signal' && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      setSelected(event.key === 'Home' ? 0 : SIGNAL_N - 1)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (target === 'lens') setLens(([x, y]) => [clamp(x + step.dx, 0, N - 1), clamp(y - step.dy, 0, N - 1)])
    else if (step.dx) setSelected((i) => clamp(i + step.dx, 0, SIGNAL_N - 1))
    else setSignal((current) => Float64Array.from(current, (v, k) => (k === selected ? clamp(v + step.dy * 0.05, SIGNAL_RANGE[0] + 0.05, SIGNAL_RANGE[1] - 0.05) : v)))
  }
  const reset = () => { setSignal(SIGNAL_INITIAL); setSelected(6); setTarget('lens'); setN(INITIAL.n); setFilter(INITIAL.filter); setRate(INITIAL.rate); setLens(INITIAL.lens) }

  return (
    <SimShell
      label="雑音を減らす"
      height={fixedHeight(layout(width).height)}
      switcher={<ModeSwitch label="断面のフィルタ" value={filter} options={FILTERS} onChange={setFilter} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="1 次元の信号と、その移動平均とメディアンの線、雑音の入った断面とフィルタをかけた断面、虫めがねの枠の中の値と出力の計算。信号の点を上下にドラッグすると値が、断面の上をドラッグすると虫めがねの枠が動きます。PageUp と PageDown で、キーで動かす物を虫めがねと信号の点で切り替え、矢印キーで動かします（信号の点は左右で隣の点を選び、上下で値を変えます。Shift で大きく）。" />}
      legend={<SimLegend items={[
        { key: 'raw', label: '元の信号', swatch: 'var(--color-ink)' },
        { key: 'ma', label: '移動平均', swatch: 'var(--lane-1)' },
        { key: 'md', label: 'メディアン', swatch: 'var(--lane-3)' },
        { key: 'ramp', label: '断面の値', value: '0 → 0.6', swatch },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
        <ParamSlider symbol="n" label="信号の窓の幅" value={n} min={3} max={9} step={2} onChange={setN} />
        <ParamSlider label="ごま塩の雑音" value={rate} min={0} max={12} step={1} unit="%" onChange={setRate} />
      </>}
    />
  )
}
