import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton, ModeSwitch, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes } from '../axes'
import { drawParticle, drawNote, fmt } from './fluidKit.js'
import {
  KERNELS,
  PRESETS,
  X_RANGE,
  evenPositions,
  presetValues,
  volumes1d,
  weight1d,
  interpolate1d,
  weightSum1d,
  countWithin1d,
  curve1d,
  kernelCurve1d,
  moveParticle1d,
} from './fluidKernel1d.js'

// 段階 1「粒子で量を表す（重み関数）」: 1 次元に並べた粒子の値を、核 W で重みをつけて足して、なめらかな曲線にする。
// 上の図は、粒子(点。位置 x_j と値 A_j)と、足し合わせてできる曲線 A(x)。下の図は、調べる位置を中心にした核 W と、
// 各粒子の重み(幅 V_j、高さ W の棒。面積が重み V_j·W で、全部足すと 1)。
// 計算は fluidKernel1d.js(核の形は utils/vis/sph.js)。ここは操作と描画。
const V_RANGE = [0, 1.1] // 値 A の表示範囲
const TOP_MARGIN = { left: 44, right: 14, top: 20, bottom: 24 }
const BOTTOM_MARGIN = { left: 44, right: 14, top: 22, bottom: 40 }
const TOP_SHARE = 0.56 // 上の図が canvas の高さに占める割合
const GRAB_PX = 16 // 点のまわり、このくらいまでならつかめる(指で触れやすいように)
const HEIGHT = { pc: [340, 420], phone: [320, 400] }

function layout(width, height) {
  const topH = Math.round(height * TOP_SHARE)
  const top = makeView({ width, height: topH, xRange: X_RANGE, yRange: V_RANGE, margin: TOP_MARGIN, equal: false })
  return { topH, top, bottomH: height - topH }
}

function bottomView(width, bottomH, peak) {
  return makeView({ width, height: bottomH, xRange: X_RANGE, yRange: [0, peak * 1.15], margin: BOTTOM_MARGIN, equal: false })
}

export default function FluidStep1() {
  const [kind, setKind] = useState('spline')
  const [h, setH] = useState(0.2)
  const [n, setN] = useState(11)
  const [preset, setPreset] = useState('step')
  const [probe, setProbe] = useState(0.5)
  const [showParts, setShowParts] = useState(false)

  const model = useRef(null)
  if (model.current === null) {
    const xs = evenPositions(11)
    model.current = { xs, vals: presetValues('step', xs), selected: 5 }
  }
  const params = useRef({})
  params.current = { kind, h, probe, showParts }
  const legend = useRef(null)
  const live = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const { xs, vals, selected } = model.current
    const { kind: k, h: hh, probe: px0, showParts: parts } = params.current
    const { topH, top, bottomH } = layout(width, height)
    const vols = volumes1d(xs, k, hh)
    const peak = weight1d(k, 0, hh)
    const bot = bottomView(width, bottomH, peak)
    const aProbe = interpolate1d(px0, xs, vals, vols, k, hh)
    const wSum = weightSum1d(px0, xs, vols, k, hh)
    const near = countWithin1d(px0, xs, hh)
    const ink = colors.ink
    const probeColor = colors.alpha('lane-3', 1)

    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // ---- 上の図: 粒子と、足し合わせた曲線 A(x)
    drawAxes(ctx, top, { colors, yLabel: 'A（値）' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(top.frame.left, top.frame.top, top.frame.width, top.frame.height)
    ctx.clip()
    // 調べる位置と、影響半径 h の範囲
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    for (const x of [px0 - hh, px0 + hh]) {
      ctx.moveTo(top.sx(x), top.frame.top)
      ctx.lineTo(top.sx(x), top.frame.bottom)
    }
    ctx.stroke()
    ctx.setLineDash([])
    if (parts) {
      ctx.strokeStyle = colors.alpha('lane-0', 0.75)
      ctx.lineWidth = 1.25
      for (let j = 0; j < xs.length; j++) {
        ctx.beginPath()
        for (let i = 0; i <= 120; i++) {
          const x = X_RANGE[0] + ((X_RANGE[1] - X_RANGE[0]) * i) / 120
          const y = vols[j] * vals[j] * weight1d(k, x - xs[j], hh)
          if (i === 0) ctx.moveTo(top.sx(x), top.sy(y))
          else ctx.lineTo(top.sx(x), top.sy(y))
        }
        ctx.stroke()
      }
    }
    // 曲線 A(x)
    ctx.strokeStyle = ink
    ctx.lineWidth = 2.5
    ctx.beginPath()
    curve1d(xs, vals, vols, k, hh).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(top.sx(x), top.sy(y)) : ctx.lineTo(top.sx(x), top.sy(y))))
    ctx.stroke()
    // 調べる位置
    ctx.strokeStyle = probeColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(top.sx(px0), top.frame.top)
    ctx.lineTo(top.sx(px0), top.frame.bottom)
    ctx.stroke()
    ctx.restore()
    drawParticle(ctx, top.sx(px0), top.sy(aProbe), 5, probeColor, ink, 1.5)
    // 粒子(点)と、そこから軸へ下ろした線
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let j = 0; j < xs.length; j++) {
      ctx.moveTo(top.sx(xs[j]), top.sy(0))
      ctx.lineTo(top.sx(xs[j]), top.sy(vals[j]))
    }
    ctx.stroke()
    for (let j = 0; j < xs.length; j++) {
      const inside = Math.abs(xs[j] - px0) < hh
      drawParticle(ctx, top.sx(xs[j]), top.sy(vals[j]), 5.5, colors.alpha('lane-1', inside ? 1 : 0.55), ink, j === selected ? 3 : 1.25)
    }

    // ---- 下の図: 調べる位置を中心にした核 W と、各粒子の重み
    ctx.save()
    ctx.translate(0, topH)
    drawAxes(ctx, bot, { colors, xLabel: 'x [m]', yLabel: 'W [1/m]' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(bot.frame.left, bot.frame.top, bot.frame.width, bot.frame.height)
    ctx.clip()
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    for (const x of [px0 - hh, px0 + hh]) {
      ctx.moveTo(bot.sx(x), bot.frame.top)
      ctx.lineTo(bot.sx(x), bot.frame.bottom)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = colors.alpha('lane-3', 0.35)
    ctx.strokeStyle = probeColor
    ctx.lineWidth = 1
    for (let j = 0; j < xs.length; j++) {
      const w = weight1d(k, px0 - xs[j], hh)
      if (w <= 0) continue
      const x0 = bot.sx(xs[j] - vols[j] / 2)
      const x1 = bot.sx(xs[j] + vols[j] / 2)
      ctx.fillRect(x0, bot.sy(w), x1 - x0, bot.sy(0) - bot.sy(w))
      ctx.strokeRect(x0, bot.sy(w), x1 - x0, bot.sy(0) - bot.sy(w))
    }
    ctx.strokeStyle = probeColor
    ctx.lineWidth = 2.5
    ctx.beginPath()
    kernelCurve1d(px0, k, hh).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(bot.sx(x), bot.sy(y)) : ctx.lineTo(bot.sx(x), bot.sy(y))))
    ctx.stroke()
    ctx.restore()
    drawNote(ctx, colors, '棒の面積＝重み', bot.frame.right - 4, bot.frame.top + 4, { align: 'right' })
    ctx.restore()

    legend.current?.update({
      h: `${fmt(hh)} m`,
      x: `${fmt(px0)} m`,
      A: fmt(aProbe),
      sum: fmt(wSum, 3),
      count: `${near} 個`,
    })
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  }, [kind, h, probe, showParts, redraw])

  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }

  // 画面の座標 → どの図の、どの世界の座標か(下の図は y が W)
  const locate = (x, y) => {
    const { width, height } = sizeRef.current
    const { topH, top } = layout(width, height)
    return { inTop: y < topH, top, wx: top.wx(x), wy: top.wy(y) }
  }
  const particleAt = (x, y) => {
    const { width, height } = sizeRef.current
    const { top, topH } = layout(width, height)
    if (y >= topH) return -1
    const { xs, vals } = model.current
    let best = -1
    let bestD = GRAB_PX
    for (let j = 0; j < xs.length; j++) {
      const d = Math.hypot(top.sx(xs[j]) - x, top.sy(vals[j]) - y)
      if (d <= bestD) {
        bestD = d
        best = j
      }
    }
    return best
  }

  const drag = useRef(null) // { kind: 'particle', index } か { kind: 'probe' }
  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => particleAt(x, y) >= 0,
    onDown: ({ x, y }) => {
      const j = particleAt(x, y)
      if (j >= 0) {
        model.current.selected = j
        drag.current = { kind: 'particle', index: j }
      } else {
        drag.current = { kind: 'probe' }
        setProbe(clampProbe(locate(x, y).wx))
      }
      redraw()
    },
    onMove: ({ x, y }) => {
      const d = drag.current
      if (!d) return
      const { wx, wy } = locate(x, y)
      if (d.kind === 'particle') {
        moveParticle1d(model.current.xs, model.current.vals, d.index, wx, wy, X_RANGE, V_RANGE)
        redraw()
      } else {
        setProbe(clampProbe(wx))
      }
    },
    onUp: () => {
      drag.current = null
    },
  })

  // 矢印キー: ← → で粒子を選び、↑ ↓ で値を変える(Shift を押すと大きく)。Shift + ← → で粒子の位置を動かす
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const m = model.current
    const last = m.xs.length - 1
    let handled = true
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const dir = event.key === 'ArrowRight' ? 1 : -1
      if (event.shiftKey) {
        moveParticle1d(m.xs, m.vals, m.selected, m.xs[m.selected] + dir * 0.01, m.vals[m.selected], X_RANGE, V_RANGE)
        announce(`粒子 ${m.selected + 1}：x = ${fmt(m.xs[m.selected])} m`)
      } else {
        m.selected = Math.min(last, Math.max(0, m.selected + dir))
        announce(`粒子 ${m.selected + 1}：x = ${fmt(m.xs[m.selected])} m，値 ${fmt(m.vals[m.selected])}`)
      }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const dir = event.key === 'ArrowUp' ? 1 : -1
      moveParticle1d(m.xs, m.vals, m.selected, m.xs[m.selected], m.vals[m.selected] + dir * (event.shiftKey ? 0.2 : 0.05), X_RANGE, V_RANGE)
      announce(`粒子 ${m.selected + 1}：値 ${fmt(m.vals[m.selected])}`)
    } else {
      handled = false
    }
    if (handled) {
      event.preventDefault()
      redraw()
    }
  }

  function relayout(count, nextPreset) {
    const xs = evenPositions(count)
    model.current = { xs, vals: presetValues(nextPreset, xs), selected: Math.min(model.current.selected, count - 1) }
    redraw()
  }
  const changeCount = (count) => {
    setN(count)
    relayout(count, preset)
  }
  const changePreset = (next) => {
    setPreset(next)
    relayout(n, next)
  }
  const reset = () => {
    setProbe(0.5)
    relayout(n, preset)
  }

  const legendItems = [
    { key: 'h', symbol: 'h', label: '影響半径', value: '', minChars: 7 },
    { key: 'x', symbol: 'x', label: '調べる位置', value: '', minChars: 7 },
    { key: 'A', symbol: 'A(x)', label: '足した値', value: '', minChars: 5 },
    { key: 'sum', label: '重みの和 ΣV·W', value: '', minChars: 6 },
    { key: 'count', label: '重みが 0 でない粒子', value: '', minChars: 5 },
  ]

  return (
    <SimShell
      label="重み関数のシミュレーション"
      aspect={1.3}
      height={HEIGHT}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="上の図は 1 次元に並べた粒子の値と、核で重みをつけて足した曲線。下の図は、調べる位置を中心にした核と各粒子の重み。点をつかんで動かせる。何もない所をドラッグすると調べる位置が動く。矢印キーで、粒子を選んで値を変えられる"
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={legendItems} />
          <span className="sr-only" aria-live="polite" ref={live} />
        </>
      }
      controls={
        <>
          <SimToolbar>
            <ResetButton onClick={reset} />
            <ToggleButton pressed={showParts} onChange={setShowParts}>
              各粒子の寄与を表示
            </ToggleButton>
          </SimToolbar>
          <ControlGroup label="核の形">
            <ModeSwitch label="核の形" value={kind} onChange={setKind} options={KERNELS.map((x) => ({ value: x.id, label: x.label }))} />
          </ControlGroup>
          <ControlGroup label="粒子の値の並び">
            <ModeSwitch label="粒子の値の並び" value={preset} onChange={changePreset} options={PRESETS.map((x) => ({ value: x.id, label: x.label }))} />
          </ControlGroup>
          <ParamSlider symbol="h" label="影響半径" unit="m" value={h} min={0.04} max={0.5} step={0.01} onChange={setH} format={(v) => v.toFixed(2)} />
          <ParamSlider symbol="N" label="粒子の数" unit="個" value={n} min={5} max={16} step={1} onChange={changeCount} />
          <ParamSlider symbol="x" label="調べる位置" unit="m" value={probe} min={0} max={1} step={0.01} onChange={setProbe} format={(v) => v.toFixed(2)} />
        </>
      }
    />
  )
}

const clampProbe = (x) => Math.min(X_RANGE[1], Math.max(X_RANGE[0], x))
