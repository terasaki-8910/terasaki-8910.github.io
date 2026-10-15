import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { axisTicks, formatTick } from '../axes'
import {
  L0,
  analyticX,
  angularFrequency,
  clampExtension,
  createSpring1d,
  criticalDamping,
  decayRate,
  envelopeAmplitude,
  extensionOf,
  holdHand,
  periodOf,
  placeAt,
  setConstants,
  stableDt1d,
  stepSpring1d,
  velocityOf,
} from './clothSpring1d'
import { clearTrace, createTrace, pushTrace, sampleInterval, splitLayout } from './clothTrace'
import { drawDivergedNotice } from './clothNetDraw'
import { drawSpringPicture, drawText, drawTimePlot, overMass, pictureView, strokePolyline } from './clothDraw'
import { fmtMs, fmtSigned, fmtTime, runSteps } from './clothStepKit'

// 段階 2「単振動」・段階 4「減衰」・段階 5「安定の条件」: 壁につないだバネとおもりを、時間を進めて動かす。
// 同じ部品で、variant が違う:
//   'shm'        m と k を変える。解析解 x0·cos(ωt)(破線)と周期 T = 2π√(m/k) の印を重ねる
//   'damped'     減衰係数 k_d を変える。振動の大きさが e^{−γt} で小さくなる包絡線を重ねる
//   'stability'  時間刻み Δt と k を変える。Δt が 2√(m/k) を超えると発散する。Δt の目盛り(安定・発散の領域)を絵の下に出す
// どれも、おもりをつかんで引いて離す(または矢印キー)と、そこから動き出す。力と時間の進め方は clothSpring1d.js
// (massSpring.js の springForce と半陰的オイラー法 massSpringStep)。グラフは横軸が時間 t [s]。
const X0 = 0.5 // 最初の伸び [m]
const X0_STABILITY = 0.4
const DT_FIXED = 0.005 // 'shm'・'damped' の時間刻み [s]
const WINDOW = { shm: 8, damped: 8, stability: 10 } // グラフの横軸の長さ [s]
const MAX_STEPS = 8
const Y_RANGE = [-0.8, 0.8]
const GAUGE_H = 42
const STEP_KEY = 0.05

const LABELS = {
  shm: '単振動のシミュレーション',
  damped: '減衰のシミュレーション',
  stability: '安定の条件のシミュレーション',
}

export default function ClothOscillator({ variant }) {
  const [m, setM] = useState(1)
  const [k, setK] = useState(16)
  const [kd, setKd] = useState(0.8)
  const [dtMs, setDtMs] = useState(300)
  const [announce, setAnnounce] = useState('')
  const isStab = variant === 'stability'
  const x0 = isStab ? X0_STABILITY : X0

  const worldRef = useRef(null)
  if (!worldRef.current) {
    worldRef.current = createSpring1d({ m: 1, k: 16, kd: variant === 'damped' ? 0.8 : 0, x: x0 })
  }
  const traceRef = useRef(null)
  if (!traceRef.current) traceRef.current = createTrace(1)
  const clock = useRef({ acc: 0, t: 0 })
  const baseline = useRef({ t: 0, x: x0, v: 0 }) // 解析解・包絡線の出発点(離した時刻・伸び・速度)
  const legend = useRef(null)
  const hand = useRef({ grabbed: false, dx: 0 })
  const dt = isStab ? dtMs / 1000 : DT_FIXED
  const kdEff = variant === 'damped' ? kd : 0
  const params = useRef({})
  params.current = { m, k, kd: kdEff, dt, dtMs }

  const layoutOf = useCallback(
    (width, height) => {
      const lay = splitLayout(width, height, { force: 'stack', stackRatio: isStab ? 0.3 : 0.36 })
      if (!isStab) return { ...lay, gauge: null, plot: lay.b }
      return { ...lay, gauge: { x: lay.b.x, y: lay.b.y, w: lay.b.w, h: GAUGE_H }, plot: { ...lay.b, y: lay.b.y + GAUGE_H, h: lay.b.h - GAUGE_H } }
    },
    [isStab],
  )

  const draw = useCallback(
    ({ ctx, width, height, colors }) => {
      const world = worldRef.current
      const p = params.current
      const lane = colors.alpha('lane-0', 1)
      const x = extensionOf(world)
      const c = clock.current
      const W = WINDOW[variant]
      ctx.fillStyle = colors.surface
      ctx.fillRect(0, 0, width, height)
      const lay = layoutOf(width, height)

      // 絵
      ctx.save()
      ctx.translate(lay.a.x, lay.a.y)
      drawSpringPicture(ctx, pictureView(lay.a), colors, { x: Math.max(-0.95, Math.min(1, x)), m: p.m, grabbed: hand.current.grabbed })
      ctx.restore()

      // Δt の目盛り(安定の条件)
      if (lay.gauge) drawGauge(ctx, lay.gauge, colors, p.dtMs / 1000, stableDt1d(p.m, p.k))

      // グラフ
      const b = baseline.current
      const consts = { m: p.m, k: p.k, kd: p.kd }
      const key = [{ label: '計算', color: lane, width: 2.5 }]
      if (variant === 'shm') key.push({ label: '式 x0 cos ωt', color: colors.ink, width: 1.5, dash: [5, 4] })
      const A = variant === 'damped' ? envelopeAmplitude(consts, b.x, b.v) : null
      if (A !== null) key.push({ label: '包絡線 ±Ae^(−γt)', color: colors.ink, width: 1.5, dash: [2, 4] })
      const overlay = (ctx2, view) => {
        const t0 = view.xRange[0]
        const t1 = view.xRange[1]
        if (variant === 'shm') {
          const start = Math.max(b.t, t0)
          const pts = []
          for (let i = 0; i <= 240; i++) {
            const t = start + ((t1 - start) * i) / 240
            pts.push([view.sx(t), view.sy(analyticX(t - b.t, consts, b.x, b.v))])
          }
          strokePolyline(ctx2, pts, { color: colors.ink, width: 1.5, dash: [5, 4] })
          // 周期 T の印: 窓の中で、最初に全部見える 1 周期
          const T = periodOf(p.m, p.k)
          const j = Math.max(0, Math.ceil((t0 - b.t) / T))
          const s = b.t + j * T
          if (s + T <= t1) {
            const y = view.sy(Y_RANGE[1] * 0.72)
            ctx2.save()
            ctx2.strokeStyle = colors.ink
            ctx2.lineWidth = 1.5
            ctx2.beginPath()
            ctx2.moveTo(view.sx(s), y)
            ctx2.lineTo(view.sx(s + T), y)
            ctx2.moveTo(view.sx(s), y - 4)
            ctx2.lineTo(view.sx(s), y + 4)
            ctx2.moveTo(view.sx(s + T), y - 4)
            ctx2.lineTo(view.sx(s + T), y + 4)
            ctx2.stroke()
            ctx2.setLineDash([2, 3])
            ctx2.strokeStyle = colors.muted
            ctx2.beginPath()
            ctx2.moveTo(view.sx(s), y)
            ctx2.lineTo(view.sx(s), view.sy(0))
            ctx2.moveTo(view.sx(s + T), y)
            ctx2.lineTo(view.sx(s + T), view.sy(0))
            ctx2.stroke()
            ctx2.restore()
            drawText(ctx2, `T = ${T.toFixed(2)} s`, view.sx(s + T / 2), y - 10, { color: colors.ink, size: 12, align: 'center', mono: true, halo: colors.surface })
          }
        } else if (variant === 'damped') {
          if (A !== null) {
            const g = decayRate(p.m, p.kd)
            const start = Math.max(b.t, t0)
            const up = []
            const down = []
            for (let i = 0; i <= 120; i++) {
              const t = start + ((t1 - start) * i) / 120
              const e = A * Math.exp(-g * (t - b.t))
              up.push([view.sx(t), view.sy(e)])
              down.push([view.sx(t), view.sy(-e)])
            }
            strokePolyline(ctx2, up, { color: colors.ink, width: 1.5, dash: [2, 4] })
            strokePolyline(ctx2, down, { color: colors.ink, width: 1.5, dash: [2, 4] })
          }
        }
        // 発散の印
        if (world.diverged) drawText(ctx2, '発散', view.sx(t0 + (t1 - t0) / 2), view.sy(0.45), { color: colors.alpha('diff-delete', 1), size: 14, align: 'center' })
      }
      const showMarkers = isStab && p.dt >= W / 90
      drawTimePlot(ctx, lay.plot, colors, {
        trace: traceRef.current,
        key,
        tNow: c.t,
        W,
        yRange: Y_RANGE,
        yTickRange: [-0.5, 0.5],
        yLabel: 'x [m]',
        zero: true,
        series: [{ ch: 0, color: lane, width: 2.5, markers: showMarkers }],
        overlay,
      })
      if (world.diverged) drawDivergedNotice(ctx, width, height, colors, 'Δt が限界を超えて、計算が発散しました')
    },
    [layoutOf, variant, isStab],
  )

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const publishLive = useCallback(() => {
    const world = worldRef.current
    legend.current?.update({
      t: fmtTime(clock.current.t),
      x: world.diverged ? '発散' : `${fmtSigned(extensionOf(world), 3)} m`,
      v: world.diverged ? '発散' : `${fmtSigned(velocityOf(world), 3)} m/s`,
    })
  }, [])

  const restartBaseline = useCallback(() => {
    const world = worldRef.current
    baseline.current = { t: clock.current.t, x: extensionOf(world), v: velocityOf(world) }
  }, [])

  const reset = useCallback(() => {
    const world = worldRef.current
    world.hand = null
    hand.current.grabbed = false
    placeAt(world, x0)
    clock.current.acc = 0
    clock.current.t = 0
    clearTrace(traceRef.current)
    pushTrace(traceRef.current, 0, [x0])
    baseline.current = { t: 0, x: x0, v: 0 }
    publishLive()
    redraw()
  }, [x0, publishLive, redraw])

  const loop = useSimLoop(
    (frameDt) => {
      const world = worldRef.current
      const c = clock.current
      const p = params.current
      const interval = Math.min(sampleInterval(WINDOW[variant], 600), p.dt * 0.9)
      runSteps(c, frameDt, p.dt, MAX_STEPS, (step) => {
        stepSpring1d(world, 'semi', step)
        pushTrace(traceRef.current, c.t + step, [extensionOf(world)], interval)
      })
      publishLive()
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 最初の 1 点
  useEffect(() => {
    pushTrace(traceRef.current, 0, [x0])
    publishLive()
    redraw()
  }, [x0, publishLive, redraw])

  // m・k・k_d を変える: 動いている途中でも、そのまま続ける(解析解・包絡線は、いまの状態から出直す)。安定の条件は最初からやり直す
  useEffect(() => {
    const world = worldRef.current
    setConstants(world, { m, k, kd: kdEff })
    if (isStab) reset()
    else {
      restartBaseline()
      redraw()
    }
  }, [m, k, kdEff, dtMs, isStab, reset, restartBaseline, redraw])

  // ---- つかむ ----
  const picture = () => {
    const { width, height } = sizeRef.current
    const { a } = layoutOf(width, height)
    return { a, view: pictureView(a) }
  }
  const hit = (p) => {
    const { a, view } = picture()
    return overMass(view, extensionOf(worldRef.current), params.current.m, p.x - a.x, p.y - a.y)
  }
  const move = (p) => {
    const { a, view } = picture()
    const world = worldRef.current
    holdHand(world, view.wx(p.x - a.x - hand.current.dx) - L0)
    if (!loop.running) {
      publishLive()
      redraw()
    }
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (p) => {
      if (!hit(p)) return false
      const { a, view } = picture()
      hand.current.grabbed = true
      hand.current.dx = p.x - a.x - view.sx(L0 + extensionOf(worldRef.current))
      move(p)
    },
    onMove: move,
    onUp: () => {
      const world = worldRef.current
      hand.current.grabbed = false
      holdHand(world, null)
      restartBaseline()
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 4 * STEP_KEY : STEP_KEY
    const world = worldRef.current
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = extensionOf(world) + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = extensionOf(world) - step
    else if (event.key === 'Home') next = 0
    if (next === null) return
    event.preventDefault()
    const v = clampExtension(Math.round(next * 100) / 100)
    placeAt(world, v)
    restartBaseline()
    setAnnounce(`伸び x = ${fmtSigned(v, 2)} m、手を離した`)
    publishLive()
    redraw()
  }

  // ---- 凡例 ----
  const w0 = angularFrequency(m, k)
  const legendItems = [{ key: 't', symbol: 't', label: '時刻', value: fmtTime(clock.current.t), minChars: 7 }]
  if (variant === 'shm') {
    legendItems.push(
      { key: 'x', symbol: 'x', label: '伸び', value: '0 m', minChars: 8 },
      { key: 'v', symbol: 'v', label: '速度', value: '0 m/s', minChars: 9 },
      { key: 'T', symbol: 'T', label: '周期 2π√(m/k)', value: `${periodOf(m, k).toFixed(2)} s` },
      { key: 'w', symbol: '\\omega', label: '角振動数 √(k/m)', value: `${w0.toFixed(2)} rad/s` },
    )
  } else if (variant === 'damped') {
    const crit = criticalDamping(1, 16)
    const regime = kdEff < crit * 0.999 ? '振動しながら小さくなる' : kdEff > crit * 1.001 ? '振動せずゆっくり戻る' : '臨界（ちょうど振動しない）'
    legendItems.push(
      { key: 'x', symbol: 'x', label: '伸び', value: '0 m', minChars: 8 },
      { key: 'v', symbol: 'v', label: '速度', value: '0 m/s', minChars: 9 },
      { key: 'kd', symbol: 'k_d', label: '減衰係数', value: `${kdEff.toFixed(1)} N·s/m` },
      { key: 'g', symbol: '\\gamma', label: '減る速さ k_d/2m', value: `${decayRate(1, kdEff).toFixed(2)} 1/s` },
      { key: 'crit', label: '臨界 2√(mk)', value: `${crit.toFixed(1)} N·s/m` },
      { key: 'regime', label: '動き', value: regime },
    )
  } else {
    const limit = stableDt1d(m, k)
    legendItems.push(
      { key: 'x', symbol: 'x', label: '伸び', value: '0 m', minChars: 8 },
      { key: 'v', symbol: 'v', label: '速度', value: '0 m/s', minChars: 9 },
      { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: fmtMs(dt) },
      { key: 'limit', label: '安定の限界 2√(m/k)', value: fmtMs(limit) },
      { key: 'ratio', label: 'Δt ÷ 限界', value: `${(dt / limit).toFixed(2)}${dt >= limit ? '（超えている）' : ''}` },
    )
  }

  const controls = (
    <>
      <SimToolbar>
        <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
        <ResetButton onClick={reset} />
      </SimToolbar>
      {variant === 'shm' && (
        <>
          <ParamSlider symbol="m" label="おもりの質量" unit="kg" value={m} min={0.5} max={3} step={0.1} onChange={setM} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={6} max={40} step={1} onChange={setK} />
        </>
      )}
      {variant === 'damped' && (
        <ParamSlider symbol="k_d" label="減衰係数" unit="N·s/m" value={kd} min={0} max={12} step={0.1} onChange={setKd} format={(v) => v.toFixed(1)} />
      )}
      {isStab && (
        <>
          <ParamSlider symbol="\Delta t" label="時間刻み" unit="ms" value={dtMs} min={10} max={1000} step={10} onChange={setDtMs} />
          <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={4} max={40} step={1} onChange={setK} />
        </>
      )}
    </>
  )

  return (
    <SimShell
      label={LABELS[variant]}
      aspect={1.5}
      height={{ pc: [340, 420], phone: [320, 400] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="壁につないだバネとおもりと、おもりの位置 x の時間変化のグラフ。おもりをドラッグして離すか、左右の矢印キーで位置を変えると、そこから動き出す"
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={legendItems} />
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={controls}
    />
  )
}

// Δt の目盛り: 0 〜 1000 ms の帯を、限界 2√(m/k) で「安定」と「発散」に分け、いまの Δt に印を付ける
function drawGauge(ctx, rect, colors, dt, limit) {
  const MAX = 1
  const left = rect.x + 56
  const right = rect.x + rect.w - 20
  const y = rect.y + 18
  const sx = (v) => left + (Math.min(v, MAX) / MAX) * (right - left)
  ctx.save()
  const xl = sx(limit)
  ctx.fillStyle = colors.alpha('diff-insert', 0.3)
  ctx.fillRect(left, y - 6, xl - left, 12)
  ctx.fillStyle = colors.alpha('diff-delete', 0.3)
  ctx.fillRect(xl, y - 6, right - xl, 12)
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.strokeRect(left + 0.5, y - 6.5, right - left, 12)
  ctx.strokeStyle = colors.ink // 限界の線
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(xl, y - 8)
  ctx.lineTo(xl, y + 8)
  ctx.stroke()
  ctx.lineWidth = 1
  // 目盛り(ms)
  const ticks = axisTicks(0, MAX * 1000, Math.max(2, Math.floor((right - left) / 70)))
  ctx.fillStyle = colors.ink
  ctx.font = '11px "Fira Mono", "Zen Kurenaido", ui-monospace, monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.beginPath()
  ctx.strokeStyle = colors.muted
  for (const t of ticks.values) {
    const px = Math.round(sx(t / 1000)) + 0.5
    ctx.moveTo(px, y + 6)
    ctx.lineTo(px, y + 9)
  }
  ctx.stroke()
  for (const t of ticks.values) ctx.fillText(formatTick(t, ticks.step), sx(t / 1000), y + 9)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('Δt [ms]', left - 6, y)
  // 領域の名前
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  if (xl - left > 40) ctx.fillText('安定', (left + xl) / 2, y)
  if (right - xl > 40) ctx.fillText('発散', (xl + right) / 2, y)
  // いまの Δt: 三角の印
  const px = sx(dt)
  ctx.fillStyle = colors.ink
  ctx.beginPath()
  ctx.moveTo(px, y - 7)
  ctx.lineTo(px - 5, y - 15)
  ctx.lineTo(px + 5, y - 15)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
