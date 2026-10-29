import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { PlayPauseButton, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import useSimLoop from '../../visualization/useSimLoop'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { doubleGyre, pathline, streakline } from '../../../utils/vis/flow'
import { HANDLE_HIT, clampInside, clipToFrame, drawHandle, fitView, traceLine, unitField } from './flowKit'

const BOUNDS = [0, 0, 2, 1]
const X_RANGE = [0, 2]
const Y_RANGE = [0, 1]
const OMEGA = (2 * Math.PI) / 10 // 渦の揺れの角速度。周期は 10 s
const A = 0.1
const T_END = 24
const T_START = 12
const EPS_DEFAULT = 0.2
const SEED = [0.85, 0.3]
const T0 = 0 // 粒子を放し始める時刻
const H = 0.1 // 流跡線・流脈線の時間の刻み
const MAX_DYE = 400 // 染料の粒の数の上限(時刻が進むと、放す間隔を広げて、この数までに収める)

export default function FlowStep4() {
  const [eps, setEps] = useState(EPS_DEFAULT)
  const [t, setT] = useState(T_START)
  const state = useRef(null)
  state.current = { eps, t }
  const seed = useRef([...SEED])
  const grabbed = useRef(false)
  const legend = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const { eps: e, t: time } = state.current
    const view = fitView(width, height, X_RANGE, Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const field = doubleGyre({ A, eps: e, omega: OMEGA })
    const p = seed.current
    // 流線: いまの時刻 t で流れを止め、出発点を通る線を前後にたどる(曲線に沿った長さで進める)
    const frozen = unitField((x, y) => field(x, y, time))
    const streamPts = traceLine(frozen, p, { h: 0.02, maxSteps: 220, bounds: BOUNDS })
    // 流跡線: 時刻 T0 に出発点で放した粒子が、時刻 t までに通った道
    const pathPts = pathline(field, p, T0, time, H)
    // 流脈線: 時刻 T0 から t まで、出発点から出し続けた染料の、時刻 t での位置を放した順に結ぶ
    const interval = Math.max(0.04, (time - T0) / MAX_DYE)
    const streakPts = time > T0 ? streakline(field, p, T0, time, H, interval) : [p]
    const line = (points, color, w) => {
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
        else ctx.lineTo(view.sx(x), view.sy(y))
      })
      ctx.stroke()
    }
    clipToFrame(ctx, view, () => {
      // 流れの領域(壁)
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1
      ctx.strokeRect(view.sx(0), view.sy(1), view.sx(2) - view.sx(0), view.sy(0) - view.sy(1))
      // 3 本は ε = 0 で重なる。太さを変えて、重なっても 3 色とも見えるようにする
      line(streamPts, colors.ink, 3.8)
      line(pathPts, laneColor(colors, 1), 2.4)
      line(streakPts, laneColor(colors, 3), 1.2)
      if (streakPts.length <= 120) streakPts.forEach(([x, y]) => markerCircle(ctx, view.sx(x), view.sy(y), 1.7, { fill: laneColor(colors, 3) }))
      // 流跡線の先(いまの粒子の位置)
      const head = pathPts[pathPts.length - 1]
      markerCircle(ctx, view.sx(head[0]), view.sy(head[1]), 5, { fill: laneColor(colors, 1), stroke: colors.ink, lineWidth: 1.5 })
      drawHandle(ctx, view.sx(p[0]), view.sy(p[1]), colors, grabbed.current)
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const loop = useSimLoop((dt) => {
    setT((value) => {
      const next = value + dt
      return next >= T_END ? next - T_END : next
    })
  }, { targetRef: canvasRef })
  useEffect(() => { redraw() }, [eps, t, redraw])

  const viewNow = () => fitView(sizeRef.current.width, sizeRef.current.height, X_RANGE, Y_RANGE)
  const hit = (point) => {
    const view = viewNow()
    return Math.hypot(point.x - view.sx(seed.current[0]), point.y - view.sy(seed.current[1])) <= HANDLE_HIT
  }
  const moveTo = (x, y) => {
    seed.current = clampInside(viewNow(), x, y, BOUNDS)
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      loop.pause() // 再生中でも、つかんだら止める
      grabbed.current = true
      canvasRef.current?.focus({ preventScroll: true })
      redraw()
      return true
    },
    onMove: ({ x, y }) => {
      const view = viewNow()
      moveTo(view.wx(x), view.wy(y))
    },
    onUp: () => {
      grabbed.current = false
      redraw()
    },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    loop.pause()
    moveTo(seed.current[0] + step.dx * 0.02, seed.current[1] + step.dy * 0.02)
  }
  const reset = () => {
    seed.current = [...SEED]
    setEps(EPS_DEFAULT)
    setT(T_START)
    loop.pause()
  }

  return (
    <SimShell
      label="時間で変わる流れの流線・流跡線・流脈線"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="2 つの渦が揺れ動く流れで、出発点を通る流線、そこから放した粒子の流跡線、出し続けた染料の流脈線を重ねた図。出発点の丸をドラッグするか矢印キーで動かせます。" />}
      legend={(
        <SimLegend
          items={[
            { key: 'streamline', swatch: 'var(--color-ink)', label: '流線（いまの時刻の向きをたどる）' },
            { key: 'pathline', swatch: 'var(--lane-1)', label: '流跡線（粒子の道）' },
            { key: 'streakline', swatch: 'var(--lane-3)', label: '流脈線（染料）' },
            { key: 't', symbol: 't', label: '時刻', value: `${fmt(t, 1)} s`, minChars: 6 },
            { key: 't0', symbol: 't_0', label: '放し始め', value: `${T0} s` },
          ]}
        />
      )}
      controls={(
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="\varepsilon" label="渦の揺れの大きさ" value={eps} min={0} max={0.25} step={0.01} onChange={setEps} format={(v) => v.toFixed(2)} />
          <ParamSlider symbol="t" label="時刻" unit=" s" value={t} min={0} max={T_END} step={0.1} onChange={(value) => { loop.pause(); setT(value) }} format={(v) => v.toFixed(1)} />
        </>
      )}
    />
  )
}
