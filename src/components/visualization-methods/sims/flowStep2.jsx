import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, clamp, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { rotationField, streamline } from '../../../utils/vis/flow'
import { HANDLE_HIT, clipToFrame, drawHandle, fitView } from './flowKit'

const X_RANGE = [-1.62, 1.62]
const Y_RANGE = [-1.62, 1.62]
const SEED = [0.8, 0]
const H_DEFAULT = 0.2
const FIELD = rotationField(1) // v = (−y, x)。本当の流線は原点を中心とする円
const R_MIN = 0.3
const R_MAX = 1.4

// 出発点が原点に近すぎず、遠すぎないように置く(原点では速さが 0 で流線が引けず、遠いとオイラー法の線が枠から出る)
function limitSeed(p) {
  const r = Math.hypot(p[0], p[1])
  if (r < 1e-9) return [R_MIN, 0]
  const k = clamp(r, R_MIN, R_MAX) / r
  return [p[0] * k, p[1] * k]
}

function drawPath(ctx, view, points, { color, width, dots, dotColor, surface }) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
    else ctx.lineTo(view.sx(x), view.sy(y))
  })
  ctx.stroke()
  if (dots) {
    points.forEach(([x, y], i) => {
      if (i === 0 || i === points.length - 1) return
      markerCircle(ctx, view.sx(x), view.sy(y), 2.6, { fill: dotColor, stroke: surface, lineWidth: 1 })
    })
  }
  ctx.restore()
}

export default function FlowStep2() {
  const [h, setH] = useState(H_DEFAULT)
  const state = useRef(null)
  state.current = { h }
  const seed = useRef([...SEED])
  const grabbed = useRef(false)
  const legend = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const view = fitView(width, height, X_RANGE, Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const p = seed.current
    const step = state.current.h
    const n = Math.max(1, Math.round((2 * Math.PI) / step))
    const euler = streamline(FIELD, p, { h: step, maxSteps: n, method: 'euler', direction: 'forward' })
    const rk4 = streamline(FIELD, p, { h: step, maxSteps: n, method: 'rk4', direction: 'forward' })
    const r0 = Math.hypot(p[0], p[1])
    const rEuler = Math.hypot(...euler[euler.length - 1])
    const rRk4 = Math.hypot(...rk4[rk4.length - 1])
    const dots = step * r0 * view.scaleX >= 7
    const eulerColor = laneColor(colors, 3)
    clipToFrame(ctx, view, () => {
      // 本当の流線(原点を中心とする円)
      ctx.save()
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.arc(view.sx(0), view.sy(0), r0 * view.scaleX, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      // 回転の中心
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(view.sx(0) - 5, view.sy(0))
      ctx.lineTo(view.sx(0) + 5, view.sy(0))
      ctx.moveTo(view.sx(0), view.sy(0) - 5)
      ctx.lineTo(view.sx(0), view.sy(0) + 5)
      ctx.stroke()
      drawPath(ctx, view, euler, { color: eulerColor, width: 2, dots, dotColor: eulerColor, surface: colors.surface })
      drawPath(ctx, view, rk4, { color: colors.ink, width: 2, dots, dotColor: colors.ink, surface: colors.surface })
      // 1 周したあとの点
      const end = (point, color) => markerCircle(ctx, view.sx(point[0]), view.sy(point[1]), 5, { fill: colors.surface, stroke: color, lineWidth: 2.2 })
      end(euler[euler.length - 1], eulerColor)
      end(rk4[rk4.length - 1], colors.ink)
      drawHandle(ctx, view.sx(p[0]), view.sy(p[1]), colors, grabbed.current)
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    const drift = (r) => `${fmt(r, 2)}（${r >= r0 ? '+' : '−'}${fmt(Math.abs(100 * (r / r0 - 1)), 2)} %）`
    legend.current?.update({ circle: `r = ${fmt(r0, 2)}`, euler: drift(rEuler), rk4: drift(rRk4), steps: String(n) })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [h, redraw])

  const viewNow = () => fitView(sizeRef.current.width, sizeRef.current.height, X_RANGE, Y_RANGE)
  const hit = (point) => {
    const view = viewNow()
    return Math.hypot(point.x - view.sx(seed.current[0]), point.y - view.sy(seed.current[1])) <= HANDLE_HIT
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      grabbed.current = true
      canvasRef.current?.focus({ preventScroll: true })
      redraw()
      return true
    },
    onMove: ({ x, y }) => {
      const view = viewNow()
      seed.current = limitSeed([view.wx(x), view.wy(y)])
      redraw()
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
    seed.current = limitSeed([seed.current[0] + step.dx * 0.05, seed.current[1] + step.dy * 0.05])
    redraw()
  }
  const reset = () => {
    seed.current = [...SEED]
    setH(H_DEFAULT)
    redraw()
  }

  return (
    <SimShell
      label="流線を数値積分でたどる"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="原点のまわりを回る流れで、出発点から 1 周ぶん、オイラー法と RK4 で流線をたどった図。出発点の丸をドラッグするか矢印キーで動かせます。" />}
      legend={(
        <SimLegend
          ref={legend}
          items={[
            { key: 'circle', swatch: 'var(--color-muted)', label: '本当の流線（円）', value: '', minChars: 8 },
            { key: 'euler', swatch: 'var(--lane-3)', label: 'オイラー法の半径', value: '', minChars: 16 },
            { key: 'rk4', swatch: 'var(--color-ink)', label: 'RK4 の半径', value: '', minChars: 16 },
            { key: 'steps', label: '1 周の歩数', value: '', minChars: 3 },
          ]}
        />
      )}
      controls={(
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="h" label="1 歩の大きさ" value={h} min={0.05} max={0.5} step={0.01} onChange={setH} format={(v) => v.toFixed(2)} />
        </>
      )}
    />
  )
}
