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
import { GRAVITY, fallEuler, fallExact, fallTime } from './rigidMath'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle } from './rigidKit'

// 段階 1「運動方程式と前進オイラー法」: 1 つの円の落下。
// 横軸が時刻 t、縦軸が高さ y。線が解析解 y = y0 − g t²/2、点が前進オイラー法(Δt ごと)。
// 左端の円(t = 0 の高さ y0)をつかんで上下に動かすと、落とす高さが変わる。Δt を大きくすると、点が線の上に離れていく。
// 計算は rigidMath.js(utils/vis/integrate.js の eulerStep を使う)。ここは画面と操作。
const T_MAX = 0.8 // 横軸の長さ [s]。2.8 m から落としても、0.76 s で床に着く
const Y_RANGE = [0, 3]
const Y0_MIN = 0.5
const Y0_MAX = 2.8
const Y0_STEP = 0.1
const SLOW = 0.5 // 動かす速さ(実際の時間の何倍か)。落ちる時間は 1 s に満たないので、ゆっくりにする
const HOLD = 0.5 // 床に着いてから、最初に戻るまでの間 [s]
const MARKER_R = 7
const HANDLE_R = 9

const viewOf = (width, height) =>
  makeView({ width, height, xRange: [0, T_MAX], yRange: Y_RANGE, equal: false, margin: STEP_MARGIN })

export default function RigidStep1() {
  const [y0, setY0] = useState(2.4)
  const [dt, setDt] = useState(0.1)
  const tau = useRef(0)
  const grabbing = useRef(false)

  const euler = useMemo(() => fallEuler(y0, 0, GRAVITY, dt, fallTime(y0, 0, GRAVITY)), [y0, dt])
  const landing = fallTime(y0, 0, GRAVITY)
  const last = euler[euler.length - 1]
  const err = last.y - fallExact(y0, 0, GRAVITY, last.t)

  // draw は毎回の描画で最新になる(useCanvas が覚える)。値は state から直接読む
  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 't [s]', yLabel: 'y [m]' })

    // 解析解(線)
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top - 4, view.frame.width, view.frame.height + 4)
    ctx.clip()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    const n = 60
    for (let k = 0; k <= n; k++) {
      const t = (landing * k) / n
      const px = view.sx(t)
      const py = view.sy(fallExact(y0, 0, GRAVITY, t))
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 前進オイラー法(点)。Δt が大きいと、線より上に離れる
    ctx.fillStyle = laneColor(colors, 1)
    for (const p of euler) {
      ctx.beginPath()
      ctx.arc(view.sx(p.t), view.sy(p.y), 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // 動く円: 解析解の位置(輪)と、前進オイラー法の位置(塗り)
    const t = clamp(tau.current, 0, landing)
    const i = Math.min(Math.floor(t / dt + 1e-9), euler.length - 1)
    const a = euler[i]
    const b = euler[Math.min(i + 1, euler.length - 1)]
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0
    const yNum = a.y + (b.y - a.y) * f
    markerCircle(ctx, view.sx(t), view.sy(fallExact(y0, 0, GRAVITY, t)), MARKER_R, { stroke: colors.ink, lineWidth: 2 })
    markerCircle(ctx, view.sx(t), view.sy(yNum), MARKER_R - 2, { fill: laneColor(colors, 1), stroke: colors.ink, lineWidth: 1.5 })

    // つまみ(t = 0 の高さ y0)。つかんで上下に動かす
    markerCircle(ctx, view.sx(0), view.sy(y0), HANDLE_R, {
      fill: colors.accent,
      stroke: colors.ink,
      lineWidth: grabbing.current ? 3 : 2,
    })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw() // 値が変わったら止まっていても描き直す
  })

  const loop = useSimLoop(
    (frameDt) => {
      tau.current += frameDt * SLOW
      if (tau.current > landing + HOLD) tau.current = 0
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 動きを減らす設定で止まっているときは、円を床に着いたところで見せる
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    if (!loop.running) tau.current = landing
  }

  const overHandle = ({ x, y }) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    return Math.hypot(x - view.sx(0), y - view.sy(y0)) <= HANDLE_R + GRAB_SLOP_PX
  }
  const setHeight = (v) => setY0(clamp(Math.round(v / Y0_STEP) * Y0_STEP, Y0_MIN, Y0_MAX))

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
    setHeight(y0 + step.dy * Y0_STEP)
    tau.current = 0
  }

  function reset() {
    tau.current = 0
    redraw()
  }

  const legendItems = useMemo(
    () => [
      { key: 'exact', label: '解析解（線）', swatch: 'var(--color-ink)' },
      { key: 'euler', label: '前進オイラー法（点）', swatch: 'var(--lane-1)' },
      { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${dt.toFixed(2)} s` },
      { key: 'err', label: 'ずれ（最後の点）', value: `${fmt(err, 2)} m` },
    ],
    [dt, err],
  )

  return (
    <SimShell
      label="1 つの円の落下と前進オイラー法"
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="円が落ちるときの高さ y の時間変化。線は式で解いた正しい値、点は前進オイラー法の計算。左端の円をつかんで上下に動かす、または上下の矢印キーで、落とす高さを変えられる"
        />
      }
      legend={<SimLegend items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="y_0" label="落とす高さ" unit="m" value={y0} min={Y0_MIN} max={Y0_MAX} step={Y0_STEP} onChange={(v) => { setY0(v); tau.current = 0 }} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="\Delta t" label="時間刻み" unit="s" value={dt} min={0.01} max={0.25} step={0.01} onChange={setDt} format={(v) => v.toFixed(2)} />
        </>
      }
    />
  )
}
