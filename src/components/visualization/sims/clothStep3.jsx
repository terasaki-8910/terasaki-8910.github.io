import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import {
  L0,
  clampExtension,
  createSpring1d,
  explicitEnergyFactor,
  extensionOf,
  holdHand,
  placeAt,
  spring1dEnergy,
  stepSpring1d,
} from './clothSpring1d'
import { clearTrace, createTrace, pushTrace, sampleInterval, splitLayout } from './clothTrace'
import { drawSpringPicture, drawText, drawTimePlot, overMass, pictureView } from './clothDraw'
import { drawDivergedNotice } from './clothNetDraw'
import { fmtSigned, fmtTime, runSteps } from './clothStepKit'

// 段階 3「時間の進め方」: 同じバネとおもりを、前進オイラー法(古い速度で位置を進める)と半陰的オイラー法(新しい速度で進める)で
// 同時に動かして並べる。下のグラフは、2 つのエネルギー ½mv² + ½kx² の時間変化(横軸 t [s])。
// 前進は増え続け、半陰的は最初の値のまわりで揺れるだけ。おもりをつかんで引くと、2 つとも同じ位置から出発する。
// 時間の進め方は massSpring.js の massSpringStepExplicit(前進)と massSpringStep(半陰的)。
const M = 1
const K = 16
const X0 = 0.5
const W = 8 // グラフの横軸の長さ [s]
const MAX_STEPS = 8
const LANE_RULER = 36 // 下の絵の定規の高さ [px]
const STEP_KEY = 0.05
const E0_MIN = 0.5 * K * 0.1 * 0.1 // 縦軸の基準にするエネルギーの下限(伸び 0.1 m 相当)。ほぼ 0 の所から離したときも、グラフが潰れないように

export default function ClothStep3() {
  const [dtMs, setDtMs] = useState(40)
  const [announce, setAnnounce] = useState('')
  const dt = dtMs / 1000

  const worlds = useRef(null)
  if (!worlds.current) {
    worlds.current = { forward: createSpring1d({ m: M, k: K, x: X0 }), semi: createSpring1d({ m: M, k: K, x: X0 }) }
  }
  const traceRef = useRef(null)
  if (!traceRef.current) traceRef.current = createTrace(2)
  const clock = useRef({ acc: 0, t: 0 })
  const ref = useRef({ e0: 0.5 * K * X0 * X0, grabbed: false, dx: 0, lane: 0 }) // e0: 最初のエネルギー(縦軸の基準)
  const legend = useRef(null)
  const params = useRef({})
  params.current = { dt }

  // 絵を上下 2 つのレーン(上 = 前進、下 = 半陰的 + 定規)に分ける
  const layoutOf = useCallback((width, height) => {
    const lay = splitLayout(width, height, { force: 'stack', stackRatio: 0.46 })
    const lane = Math.floor((lay.a.h - LANE_RULER) / 2)
    return {
      ...lay,
      lanes: [
        { x: 0, y: 0, w: width, h: lane },
        { x: 0, y: lane, w: width, h: lane + LANE_RULER },
      ],
    }
  }, [])
  const laneView = (rect, i) => pictureView(rect, { ruler: i === 1, top: 10 })

  const draw = useCallback(
    ({ ctx, width, height, colors }) => {
      const { forward, semi } = worlds.current
      const c = clock.current
      const e0 = ref.current.e0
      const cForward = colors.alpha('lane-3', 1)
      const cSemi = colors.alpha('lane-0', 1)
      ctx.fillStyle = colors.surface
      ctx.fillRect(0, 0, width, height)
      const lay = layoutOf(width, height)

      const names = ['前進オイラー法', '半陰的オイラー法']
      ;[forward, semi].forEach((world, i) => {
        const rect = lay.lanes[i]
        ctx.save()
        ctx.translate(rect.x, rect.y)
        drawSpringPicture(ctx, laneView(rect, i), colors, {
          x: Math.max(-0.95, Math.min(1, extensionOf(world))),
          m: M,
          grabbed: ref.current.grabbed,
          ruler: i === 1,
          label: names[i],
          labelAlign: 'right',
        })
        ctx.restore()
      })
      // 2 つのレーンの間の線
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, lay.lanes[1].y + 0.5)
      ctx.lineTo(width, lay.lanes[1].y + 0.5)
      ctx.stroke()

      // エネルギーのグラフ
      const yMax = 4 * e0
      const eForward = spring1dEnergy(forward)
      drawTimePlot(ctx, lay.b, colors, {
        trace: traceRef.current,
        key: [
          { label: '前進オイラー法', color: cForward, width: 2.5, dash: [7, 3] },
          { label: '半陰的オイラー法', color: cSemi, width: 2.5 },
        ],
        tNow: c.t,
        W,
        yRange: [0, yMax],
        yLabel: 'E [J]',
        series: [
          { ch: 0, color: cForward, width: 2.5, dash: [7, 3], markers: params.current.dt >= W / 90 },
          { ch: 1, color: cSemi, width: 2.5, markers: params.current.dt >= W / 90 },
        ],
        overlay: (ctx2, v) => {
          ctx2.save()
          ctx2.strokeStyle = colors.ink
          ctx2.lineWidth = 1
          ctx2.setLineDash([2, 3])
          ctx2.beginPath()
          ctx2.moveTo(v.frame.left, v.sy(e0))
          ctx2.lineTo(v.frame.right, v.sy(e0))
          ctx2.stroke()
          ctx2.restore()
          drawText(ctx2, '最初のエネルギー', v.frame.left + 6, v.sy(e0) + 9, { color: colors.ink, size: 11, halo: colors.surface })
          if (eForward > yMax) drawText(ctx2, '前進オイラー法は、この範囲の上へ増えていく', v.frame.left + 6, v.frame.top + 10, { color: colors.ink, size: 11, halo: colors.surface })
        },
      })
      if (forward.diverged) drawDivergedNotice(ctx, width, height, colors, '前進オイラー法の値が大きくなりすぎました。リセットで戻せます')
    },
    [layoutOf],
  )

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const publishLive = useCallback(() => {
    const { forward, semi } = worlds.current
    const ef = spring1dEnergy(forward)
    const es = spring1dEnergy(semi)
    const e0 = ref.current.e0
    legend.current?.update({
      t: fmtTime(clock.current.t),
      ef: forward.diverged ? '発散' : `${ef.toFixed(ef < 100 ? 2 : 0)} J（最初の ${(ef / e0).toFixed(2)} 倍）`,
      es: `${es.toFixed(2)} J（最初の ${(es / e0).toFixed(2)} 倍）`,
    })
  }, [])

  const record = (t) => {
    const { forward, semi } = worlds.current
    pushTrace(traceRef.current, t, [spring1dEnergy(forward), spring1dEnergy(semi)], Math.min(sampleInterval(W, 600), params.current.dt * 0.9))
  }

  const reset = useCallback(() => {
    const { forward, semi } = worlds.current
    for (const w of [forward, semi]) {
      w.hand = null
      placeAt(w, X0)
    }
    ref.current.grabbed = false
    ref.current.e0 = spring1dEnergy(semi)
    clock.current.acc = 0
    clock.current.t = 0
    clearTrace(traceRef.current)
    pushTrace(traceRef.current, 0, [spring1dEnergy(forward), spring1dEnergy(semi)])
    publishLive()
    redraw()
  }, [publishLive, redraw])

  const loop = useSimLoop(
    (frameDt) => {
      const { forward, semi } = worlds.current
      const c = clock.current
      runSteps(c, frameDt, params.current.dt, MAX_STEPS, (step) => {
        stepSpring1d(forward, 'explicit', step)
        stepSpring1d(semi, 'semi', step)
        record(c.t + step)
      })
      publishLive()
      redraw()
    },
    { targetRef: canvasRef },
  )

  // Δt を変えたら最初からやり直す(前の Δt のグラフと混ぜない)
  useEffect(() => {
    reset()
  }, [dtMs, reset])

  // ---- つかむ(どちらのレーンのおもりをつかんでも、2 つとも同じ位置に置く)----
  const laneAt = (p) => {
    const { width, height } = sizeRef.current
    const lay = layoutOf(width, height)
    for (let i = 0; i < 2; i++) {
      const rect = lay.lanes[i]
      const view = laneView(rect, i)
      if (overMass(view, extensionOf(worlds.current.semi), M, p.x - rect.x, p.y - rect.y)) return { i, rect, view }
    }
    return null
  }
  const setBoth = (x) => {
    const { forward, semi } = worlds.current
    holdHand(forward, x)
    holdHand(semi, x)
    if (!loop.running) {
      publishLive()
      redraw()
    }
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => laneAt(p) !== null,
    onDown: (p) => {
      const hit = laneAt(p)
      if (!hit) return false
      ref.current.grabbed = true
      ref.current.lane = hit.i
      ref.current.dx = p.x - hit.rect.x - hit.view.sx(L0 + extensionOf(worlds.current.semi))
      setBoth(hit.view.wx(p.x - hit.rect.x - ref.current.dx) - L0)
    },
    onMove: (p) => {
      const { width, height } = sizeRef.current
      const rect = layoutOf(width, height).lanes[ref.current.lane]
      setBoth(laneView(rect, ref.current.lane).wx(p.x - rect.x - ref.current.dx) - L0)
    },
    onUp: () => {
      const { forward, semi } = worlds.current
      ref.current.grabbed = false
      holdHand(forward, null)
      holdHand(semi, null)
      ref.current.e0 = Math.max(spring1dEnergy(semi), E0_MIN)
      clearTrace(traceRef.current)
      record(clock.current.t)
      publishLive()
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const { forward, semi } = worlds.current
    const step = event.shiftKey ? 4 * STEP_KEY : STEP_KEY
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = extensionOf(semi) + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = extensionOf(semi) - step
    else if (event.key === 'Home') next = 0
    if (next === null) return
    event.preventDefault()
    const v = clampExtension(Math.round(next * 100) / 100)
    placeAt(forward, v)
    placeAt(semi, v)
    ref.current.e0 = Math.max(spring1dEnergy(semi), E0_MIN)
    clearTrace(traceRef.current)
    record(clock.current.t)
    setAnnounce(`伸び x = ${fmtSigned(v, 2)} m から出発`)
    publishLive()
    redraw()
  }

  const factor = explicitEnergyFactor(M, K, dt)
  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: fmtTime(0), minChars: 7 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${dtMs} ms` },
    { key: 'L0', symbol: 'L_0', label: '自然長（点線）', value: '1.00 m' },
    { key: 'ef', label: '前進のエネルギー', value: '', minChars: 24 },
    { key: 'es', label: '半陰的のエネルギー', value: '', minChars: 24 },
    { key: 'factor', label: '前進は 1 ステップで', value: `${factor.toFixed(3)} 倍（1 + kΔt²/m）` },
  ]

  return (
    <SimShell
      label="時間の進め方のシミュレーション"
      aspect={1.5}
      height={{ pc: [380, 460], phone: [360, 440] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="同じバネとおもりを、前進オイラー法と半陰的オイラー法で動かした絵と、2 つのエネルギーの時間変化のグラフ。おもりをドラッグして離すか、左右の矢印キーで、同じ位置から出発させられる"
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
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="\Delta t" label="時間刻み" unit="ms" value={dtMs} min={5} max={100} step={5} onChange={setDtMs} />
        </>
      }
    />
  )
}
