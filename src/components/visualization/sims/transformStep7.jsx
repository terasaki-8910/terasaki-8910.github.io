import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { fmt } from './transformCommon.js'
import { ReadNote } from './transformMatrixView.jsx'
import {
  KF_DEFAULT,
  KF_TIMES,
  T_END,
  buildModel,
  clampValue,
  drawKeyframes,
  pickKeyframe,
  plotRect,
  inPlot,
  readoutText,
  valueToY,
  xToTime,
  yToValue,
} from './transformKeyframes.js'

// 段階 7「キーフレームの補間」: キーフレームの点をつかんで上下に動かすと、線形補間(破線)と自然 3 次スプライン(実線)の曲線が追従する。
// 曲線の上を点が時間とともに動く(右の「動き」の帯でも、2 つの補間の違いが見える)。曲線の値は spline.js の lerp・evalSpline。
// 計算は transformKeyframes.js、ここは状態と操作と時間の進め方。
const UI_INTERVAL = 0.066 // 時刻のスライダーを書き換える間隔 [s]

export default function TransformStep7() {
  const [ys, setYs] = useState(KF_DEFAULT)
  const [selected, setSelected] = useState(1)
  const [time, setTime] = useState(0)
  const [announce, setAnnounce] = useState('')
  const model = useMemo(() => buildModel(ys), [ys])

  const sim = useRef({ time: 0, drag: null, ui: 0 })
  const params = useRef(null)
  params.current = { model, selected }
  const liveRef = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    drawKeyframes({ ctx, width, height, colors }, { model: p.model, selected: p.selected, time: sim.current.time })
    const live = liveRef.current
    const text = readoutText(p.model, sim.current.time, p.selected)
    if (live && live.textContent !== text) live.textContent = text
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const s = sim.current
      s.time = (s.time + dt) % T_END
      redraw()
      s.ui += dt
      if (s.ui >= UI_INTERVAL) {
        s.ui = 0
        setTime(s.time)
      }
    },
    { targetRef: canvasRef },
  )

  useEffect(() => {
    redraw()
  }, [model, selected, redraw])

  const rectNow = () => plotRect(sizeRef.current.width, sizeRef.current.height)
  const setKeyframeValue = (index, value) => {
    const next = params.current.model.ys.slice()
    next[index] = clampValue(value)
    setYs(next)
  }
  const scrubTo = (t) => {
    sim.current.time = t
    setTime(t)
    redraw()
  }
  const announceKeyframe = (i, value) => setAnnounce(`キーフレーム ${i + 1}，時刻 ${fmt(KF_TIMES[i])} 秒，x = ${fmt(value)} m`)

  usePointerDrag(canvasRef, {
    // キーフレームの上は grab(つかめる)。グラフの余白を押すと、その時刻へ移る
    canGrab: ({ x, y }) => pickKeyframe(rectNow(), params.current.model.ys, x, y) >= 0,
    onDown: ({ x, y }) => {
      const p = params.current
      const r = rectNow()
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも動かせるように
      const i = pickKeyframe(r, p.model.ys, x, y)
      if (i >= 0) {
        sim.current.drag = { kind: 'keyframe', index: i, offset: y - valueToY(r, p.model.ys[i]) }
        setSelected(i)
        return undefined
      }
      if (inPlot(r, x, y)) {
        loop.pause() // 時刻を指定したら、そこで止めて値を読めるように
        sim.current.drag = { kind: 'time' }
        scrubTo(xToTime(r, x))
        return undefined
      }
      return false
    },
    onMove: ({ x, y }) => {
      const d = sim.current.drag
      if (!d) return
      const r = rectNow()
      if (d.kind === 'keyframe') setKeyframeValue(d.index, yToValue(r, y - d.offset))
      else scrubTo(xToTime(r, x))
    },
    onUp: () => {
      sim.current.drag = null
    },
  })

  // 矢印キー: 左右でキーフレームを選び、上下で値を動かす(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const p = params.current
    const big = event.shiftKey
    const last = KF_TIMES.length - 1
    const select = (i) => {
      setSelected(i)
      announceKeyframe(i, p.model.ys[i])
    }
    const nudge = (sign) => {
      const value = clampValue(p.model.ys[p.selected] + sign * (big ? 0.25 : 0.05))
      setKeyframeValue(p.selected, value)
      announceKeyframe(p.selected, value)
    }
    if (event.key === 'ArrowLeft') select(Math.max(0, p.selected - 1))
    else if (event.key === 'ArrowRight') select(Math.min(last, p.selected + 1))
    else if (event.key === 'Home') select(0)
    else if (event.key === 'End') select(last)
    else if (event.key === 'ArrowUp') nudge(1)
    else if (event.key === 'ArrowDown') nudge(-1)
    else return
    event.preventDefault()
  }

  function reset() {
    setYs(KF_DEFAULT)
    setSelected(1)
    scrubTo(0)
  }

  return (
    <SimShell
      label="キーフレームの補間のシミュレーション"
      height={{ pc: [300, 360], phone: [240, 300] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="キーフレームの補間。横軸が時間、縦軸が値。点を縦にドラッグするか、左右の矢印キーで選んで上下の矢印キーで動かす。グラフの上を押すと、その時刻へ移る"
        />
      }
      readout={
        <>
          <div ref={liveRef} className="whitespace-pre-line" />
          <ReadNote>
            キーフレームを動かすと、線形補間（破線）は両隣の区間だけが変わり、自然 3 次スプライン（実線）は曲線の全体が少し変わる。
            同じ値が並ぶ区間でも、スプラインは膨らむ。
          </ReadNote>
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar label="補間の操作">
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider
            symbol="t"
            label="時刻"
            unit="s"
            value={time}
            min={0}
            max={T_END}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(value) => {
              loop.pause()
              scrubTo(value)
            }}
          />
          <ParamSlider
            symbol="x_k"
            label={`キーフレーム ${selected + 1} の値`}
            unit="m"
            value={ys[selected]}
            min={-1}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(value) => setKeyframeValue(selected, value)}
          />
        </>
      }
    />
  )
}
