import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes } from '../axes'
import { GRAVITY, bounceTrace, bounceWindow, expectedPeak } from './rigidMath'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from './rigidKit'

// 段階 2「反発係数」: 床で跳ね返る 1 つの円。横軸が時刻 t、縦軸が床からの高さ h。
// 左端の円(t = 0 の高さ h0)をつかんで上下に動かすと、落とす高さが変わる。e を変えると、跳ね返りの頂点が e² 倍ずつになる。
// 破線は予想 h_k = e^(2k)·h0、輪は計算で出た頂点。計算は rigidMath.js(床での反射は collide.js の reflectVelocity)。
// 頂点の高さを e² 倍に合わせるため、時間刻みは全体より細かい(Δt = 0.25 ms)。粗い Δt では前進オイラー法のずれが積もる。
const DT = 1 / 4000
const Y_RANGE = [0, 3]
const H0_MIN = 0.5
const H0_MAX = 2.8
const H0_STEP = 0.1
const HOLD = 0.6 // 最後まで進んでから、最初に戻るまでの間 [s]
const MARKER_R = 7
const HANDLE_R = 9
const GUIDES = 4 // 破線の数(h0 から h3 まで)

export default function RigidStep2() {
  const [h0, setH0] = useState(2.5)
  const [e, setE] = useState(0.7)
  const tau = useRef(0)
  const grabbing = useRef(false)

  const span = bounceWindow(h0, e)
  const trace = useMemo(() => bounceTrace({ h0, e, g: GRAVITY, dt: DT, tEnd: span }), [h0, e, span])
  const viewOf = (width, height) =>
    makeView({ width, height, xRange: [0, span], yRange: Y_RANGE, equal: false, margin: STEP_MARGIN })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 't [s]', yLabel: 'h [m]' })

    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top - 4, view.frame.width + 2, view.frame.height + 4)
    ctx.clip()

    // 予想 h_k = e^(2k)·h0 の破線
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    let lastLabelY = Infinity
    ctx.beginPath()
    for (let k = 0; k < GUIDES; k++) {
      const y = view.sy(expectedPeak(h0, e, k))
      ctx.moveTo(view.frame.left, y)
      ctx.lineTo(view.frame.right, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    for (let k = 0; k < GUIDES; k++) {
      const y = view.sy(expectedPeak(h0, e, k))
      if (Math.abs(lastLabelY - y) < 13) continue // 重なるほど近い破線の名前は省く
      lastLabelY = y
      drawText(ctx, `h${k}`, view.frame.right - 4, y - 3, { color: colors.ink, align: 'right' })
    }

    // 軌跡(間引いて描く)
    const { t, h, peaks, peakTimes } = trace
    const stride = Math.max(1, Math.floor(t.length / 900))
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.75
    ctx.beginPath()
    for (let i = 0; i < t.length; i += stride) {
      const px = view.sx(t[i])
      const py = view.sy(h[i])
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 計算で出た頂点
    for (let k = 1; k < peaks.length && k < GUIDES; k++) {
      markerCircle(ctx, view.sx(peakTimes[k]), view.sy(peaks[k]), 5, { stroke: laneColor(colors, 3), lineWidth: 2.5 })
    }
    ctx.restore()

    // 動く円
    const i = clamp(Math.floor(tau.current / DT), 0, t.length - 1)
    markerCircle(ctx, view.sx(t[i]), view.sy(h[i]), MARKER_R, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })

    // つまみ(t = 0 の高さ h0)
    markerCircle(ctx, view.sx(0), view.sy(h0), HANDLE_R, {
      fill: colors.accent,
      stroke: colors.ink,
      lineWidth: grabbing.current ? 3 : 2,
    })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  })

  const loop = useSimLoop(
    (frameDt) => {
      tau.current += frameDt
      if (tau.current > span + HOLD) tau.current = 0
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 動きを減らす設定で止まっているときは、円を最後まで進めた位置で見せる
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    if (!loop.running) tau.current = span
  }

  const overHandle = ({ x, y }) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    return Math.hypot(x - view.sx(0), y - view.sy(h0)) <= HANDLE_R + GRAB_SLOP_PX
  }
  const setHeight = (v) => {
    setH0(clamp(Math.round(v / H0_STEP) * H0_STEP, H0_MIN, H0_MAX))
    tau.current = 0
  }

  usePointerDrag(canvasRef, {
    canGrab: overHandle,
    onDown: (p) => {
      if (!overHandle(p)) return false
      grabbing.current = true
      tau.current = 0
    },
    onMove: ({ y }) => {
      const { width, height } = sizeRef.current
      setHeight(viewOf(width, height).wy(y))
    },
    onUp: () => {
      grabbing.current = false
      redraw()
    },
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step || step.dy === 0) return
    event.preventDefault()
    setHeight(h0 + step.dy * H0_STEP)
  }

  function reset() {
    tau.current = 0
    redraw()
  }

  const peakText = (k) => {
    const p = trace.peaks[k]
    return p === undefined ? '— （跳ねない）' : `${fmt(p, 2)} m（予想 ${fmt(expectedPeak(h0, e, k), 2)}）`
  }
  const legendItems = [
    { key: 'path', label: '高さ h（計算）', swatch: 'var(--color-ink)' },
    { key: 'peak', label: '頂点（計算）', swatch: 'var(--lane-3)' },
    { key: 'guide', symbol: 'e^{2k}h_0', label: '予想（破線）', swatch: 'var(--color-muted)' },
    { key: 'h1', symbol: 'h_1', label: '1 回目', value: peakText(1), minChars: 18 },
    { key: 'h2', symbol: 'h_2', label: '2 回目', value: peakText(2), minChars: 18 },
    { key: 'h3', symbol: 'h_3', label: '3 回目', value: peakText(3), minChars: 18 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${(1000 * DT).toFixed(2)} ms` },
  ]

  return (
    <SimShell
      label="床で跳ね返る円と反発係数"
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="床で跳ね返る円の高さ h の時間変化。跳ね返るたびに頂点が反発係数 e の 2 乗倍になる。左端の円をつかんで上下に動かす、または上下の矢印キーで、落とす高さを変えられる"
        />
      }
      legend={<SimLegend items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="h_0" label="落とす高さ" unit="m" value={h0} min={H0_MIN} max={H0_MAX} step={H0_STEP} onChange={setHeight} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="e" label="反発係数" value={e} min={0} max={1} step={0.05} onChange={(v) => { setE(v); tau.current = 0 }} format={(v) => v.toFixed(2)} />
        </>
      }
    />
  )
}
