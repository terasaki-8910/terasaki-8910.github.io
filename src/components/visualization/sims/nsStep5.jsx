import { useRef } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { DT } from './nsWorld.js'
import { STAGES, createSplit, stepSplit, advanceSplit } from './nsSteps.js'
import { fieldView, inside, drawField, drawVelocity, drawPush, fieldAxes, keyDirection } from './nsStepDraw.js'

// 段階 5「時間変化」: 32×32 の二重せん断層を、外力 → 移流 → 粘性 → 圧力の順に 1 段ずつ進める(分割法)。
// 色つきの矢印は直前の段で変わった速度 Δu。ドラッグした押しは、次の外力の段で足す。
// 計算は nsSteps.js(nsWorld.js の pushAt と grid.js の fluidSubstep2D。全体のシミュレーションの fluidStep2D と同じ順)。
export default function NsStep5() {
  const world = useRef(null)
  if (!world.current) world.current = createSplit()
  const legend = useRef(null)
  const raster = useRef(null)
  const { canvasRef, redraw, sizeRef } = useCanvas({
    draw: (args) => {
      const w = world.current,
        { field } = w
      const view = drawField(args, raster, field, field.dye)
      drawVelocity(args.ctx, view, field, args.colors.ink)
      const scale = w.maxDelta ? field.dx / w.maxDelta : 0
      drawVelocity(args.ctx, view, w.delta, args.colors.alpha('lane-1', 1), scale)
      // 保留中の押しは、それぞれが次の外力の段で適用される。
      for (const p of w.pending) drawPush(args.ctx, view, p, args.colors)
      fieldAxes(args.ctx, view, args.colors)
      legend.current?.update({
        next: STAGES.map((stage, i) => (i === w.cursor ? `【${stage}】` : stage)).join(' → '),
        steps: String(w.steps),
        t: `${(w.steps * DT).toFixed(3)} s`,
        delta: `${w.maxDelta.toExponential(3)} m/s`,
        scale: w.maxDelta ? `1 マス = ${w.maxDelta.toExponential(3)} m/s` : '変化なし',
        pending: `${w.pending.length} 件`,
      })
    },
  })
  const loop = useSimLoop(
    (elapsed) => {
      advanceSplit(world.current, elapsed)
      redraw()
    },
    { targetRef: canvasRef },
  )
  const viewNow = () => fieldView(sizeRef.current.width, sizeRef.current.height)
  usePointerDrag(canvasRef, {
    canGrab: (p) => inside(viewNow(), p),
    onDown: (p) => {
      if (!inside(viewNow(), p)) return false
      canvasRef.current?.focus({ preventScroll: true })
    },
    onMove: (p) => {
      const view = viewNow()
      if (!inside(view, p) || !(p.dx || p.dy)) return
      world.current.pending.push({ x: view.wx(p.x), y: view.wy(p.y), fx: p.vx / view.scaleX, fy: -p.vy / view.scaleY })
      redraw()
    },
  })
  function onKeyDown(event) {
    const direction = keyDirection(event)
    if (!direction) return
    const strength = event.shiftKey ? 3 : 1
    world.current.pending.push({ x: 0.5, y: 0.5, fx: strength * direction[0], fy: strength * direction[1] })
    redraw()
  }
  return (
    <SimShell
      label="NS方程式を項ごとに進めるシミュレーション"
      aspect={1}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="32×32の周期格子。色は染料、本文色の矢印は速度、色つきの矢印は直前の段での速度変化。太い矢印は保留中の押し。ドラッグまたは矢印キーで次の外力の段に押しを予約する。Shift は強く押す。1段進めるボタンまたは再生で進める"
        />
      }
      legend={
        <SimLegend
          ref={legend}
          items={[
            { key: 'next', label: '次の段', value: '' },
            { key: 'steps', label: 'ステップ n', value: '' },
            { key: 't', label: 't = n·Δt', value: '' },
            { key: 'delta', label: '直前の段で変わった速さの最大 |Δu|', value: '' },
            { key: 'scale', label: 'Δu の尺度', value: '' },
            { label: 'Δt', value: '1/60 s' },
            { key: 'pending', label: '次の外力で加える押し', value: '' },
            { label: '矢印', value: '速度／Δu', swatch: 'linear-gradient(to right, var(--color-ink), var(--lane-1))' },
            { label: '染料', value: '0 → 1', swatch: 'linear-gradient(to right, var(--color-paper), var(--lane-1))' },
          ]}
        />
      }
      controls={
        <SimToolbar>
          <button
            type="button"
            className="vis-btn"
            onClick={() => {
              stepSplit(world.current)
              world.current.acc = 0
              redraw()
            }}
          >
            1 段進める
          </button>
          <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
          <ResetButton
            onClick={() => {
              world.current = createSplit()
              redraw()
            }}
          />
        </SimToolbar>
      }
    />
  )
}
