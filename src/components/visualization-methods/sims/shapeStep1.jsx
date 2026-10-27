import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton, ModeSwitch } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle, drawText } from '../../visualization/sims/rigidKit'
import { ellipseImplicit, ellipsePoint, hyperbolaImplicit, hyperbolaPoint } from '../../../utils/vis/curve'
import { drawPolyline, focusOnGrab, nearestCurveSample, pageStep, rangesForAspect, sampleCurve } from './shapeKit'

const POINT_R = 7
const ELLIPSE_RANGE = [0, 2 * Math.PI]
const HYPERBOLA_RANGE = [-1.3, 1.3]
// 内側(F ≤ 0)と外側(F > 0)の塗りの濃さ。凡例の色見本も同じ割合で混ぜる(0.07 では淡い地にほとんど見えなかった)
const INSIDE_ALPHA = 0.26
const OUTSIDE_ALPHA = 0.1
const regionSwatch = (lane, alpha) => `color-mix(in srgb, var(--${lane}) ${Math.round(alpha * 100)}%, var(--color-surface))`

export default function ShapeStep1() {
  const [mode, setMode] = useState('ellipse')
  const [a, setA] = useState(2.4)
  const [b, setB] = useState(1.6)
  const [t, setT] = useState(0.7)
  const [q, setQ] = useState([0.5, 0.5])
  const [selected, setSelected] = useState('p')
  const dragging = useRef(null)

  const tRange = mode === 'ellipse' ? ELLIPSE_RANGE : HYPERBOLA_RANGE
  const pointAtT = mode === 'ellipse' ? (value) => ellipsePoint(a, b, value) : (value) => hyperbolaPoint(a, b, value)
  const implicit = mode === 'ellipse' ? (x, y) => ellipseImplicit(a, b, x, y) : (x, y) => hyperbolaImplicit(a, b, x, y)
  const samples = useMemo(() => sampleCurve((u) => pointAtT(tRange[0] + u * (tRange[1] - tRange[0])), 300), [a, b, mode])
  const p = pointAtT(t)
  const fQ = implicit(q[0], q[1])
  const viewOf = (width, height) => makeView({
    width,
    height,
    ...rangesForAspect(mode === 'ellipse' ? [-3.5, 3.5] : [-0.5, 5.5], [-3.2, 3.2], width, height),
    margin: STEP_MARGIN,
  })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    const cell = 14
    for (let py = view.frame.top; py < view.frame.bottom; py += cell) {
      for (let px = view.frame.left; px < view.frame.right; px += cell) {
        const value = implicit(view.wx(px + cell / 2), view.wy(py + cell / 2))
        ctx.fillStyle = value <= 0 ? colors.alpha('lane-0', INSIDE_ALPHA) : colors.alpha('lane-1', OUTSIDE_ALPHA)
        ctx.fillRect(px, py, Math.min(cell, view.frame.right - px), Math.min(cell, view.frame.bottom - py))
      }
    }
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    drawPolyline(ctx, view, samples.map((sample) => sample.point), { color: colors.ink, width: 2.25 })

    for (let i = 0; i < 12; i++) {
      const markT = tRange[0] + (i / 12) * (tRange[1] - tRange[0])
      const mark = pointAtT(markT)
      markerCircle(ctx, view.sx(mark[0]), view.sy(mark[1]), 2.5, { fill: colors.muted })
    }

    markerCircle(ctx, view.sx(p[0]), view.sy(p[1]), POINT_R, {
      fill: colors.accent, stroke: colors.ink, lineWidth: selected === 'p' ? 3 : 1.5,
    })
    drawText(ctx, 'P(t)', view.sx(p[0]) + 10, view.sy(p[1]) - 10, { color: colors.ink })
    markerCircle(ctx, view.sx(q[0]), view.sy(q[1]), POINT_R, {
      fill: laneColor(colors, 2), stroke: colors.ink, lineWidth: selected === 'q' ? 3 : 1.5,
    })
    drawText(ctx, `Q  F=${fmt(fQ, 2)}  ${fQ <= 0 ? '内側' : '外側'}`, view.sx(q[0]) + 10, view.sy(q[1]) - 10, { color: colors.ink })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    const curve = nearestCurveSample(view, samples, position)
    const overP = Math.hypot(position.x - view.sx(p[0]), position.y - view.sy(p[1])) <= POINT_R + GRAB_SLOP_PX
    const overQ = Math.hypot(position.x - view.sx(q[0]), position.y - view.sy(q[1])) <= POINT_R + GRAB_SLOP_PX
    return { view, curve, overP, overQ }
  }
  const setTFromU = (u) => setT(tRange[0] + u * (tRange[1] - tRange[0]))
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const info = pointerInfo(position)
      return info.overP || info.overQ
    },
    onDown: focusOnGrab(canvasRef, (position) => {
      const info = pointerInfo(position)
      if (info.overP) {
        dragging.current = 'p'
        setSelected('p')
        return
      }
      if (info.overQ) {
        dragging.current = 'q'
        setSelected('q')
        return
      }
      return false
    }),
    onMove: (position) => {
      const { view, curve } = pointerInfo(position)
      if (dragging.current === 'p') setTFromU(curve.u)
      if (dragging.current === 'q') setQ([clamp(view.wx(position.x), view.wx(view.frame.left), view.wx(view.frame.right)), clamp(view.wy(position.y), view.wy(view.frame.bottom), view.wy(view.frame.top))])
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (pageStep(event)) {
      event.preventDefault()
      setSelected((value) => value === 'p' ? 'q' : 'p')
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selected === 'p') setT((value) => clamp(value + (step.dx + step.dy) * (tRange[1] - tRange[0]) / 100, tRange[0], tRange[1]))
    else {
      const xRange = mode === 'ellipse' ? [-3.5, 3.5] : [-0.5, 5.5]
      setQ(([x, y]) => [clamp(x + step.dx * 0.1, ...xRange), clamp(y + step.dy * 0.1, -3.2, 3.2)])
    }
  }
  const changeMode = (value) => {
    setMode(value)
    setT(value === 'ellipse' ? 0.7 : 0.35)
  }
  const reset = () => {
    setA(2.4)
    setB(1.6)
    setT(mode === 'ellipse' ? 0.7 : 0.35)
    setQ([0.5, 0.5])
  }
  const legend = [
    { key: 'curve', label: mode === 'ellipse' ? '楕円' : '双曲線', swatch: 'var(--color-ink)' },
    { key: 'inside', label: '内側(F ≤ 0)', swatch: regionSwatch('lane-0', INSIDE_ALPHA) },
    { key: 'outside', label: '外側(F > 0)', swatch: regionSwatch('lane-1', OUTSIDE_ALPHA) },
    { key: 'p', symbol: 'P(t)', label: '媒介変数の点', value: `(${fmt(p[0], 2)}, ${fmt(p[1], 2)})`, minChars: 14 },
    { key: 'q', symbol: 'F(Q)', label: fQ <= 0 ? '内側' : '外側', value: fmt(fQ, 3), minChars: 9 },
  ]

  return (
    <SimShell
      label="媒介変数表示と陰関数表示"
      switcher={<ModeSwitch label="曲線" value={mode} options={[{ value: 'ellipse', label: '楕円' }, { value: 'hyperbola', label: '双曲線' }]} onChange={changeMode} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="媒介変数で表した曲線と、陰関数の符号で色分けした内側と外側。曲線に沿って動く点 P と、自由に動く点 Q をドラッグで動かせる。矢印キー(Shift で 5 倍)で選択中の点を動かし、PageUp と PageDown で P と Q を切り替える" />}
      legend={<SimLegend items={legend} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="a" label="横方向" value={a} min={0.8} max={2.8} step={0.1} onChange={setA} format={(value) => value.toFixed(1)} />
          <ParamSlider symbol="b" label="縦方向" value={b} min={0.6} max={2.2} step={0.1} onChange={setB} format={(value) => value.toFixed(1)} />
        </>
      }
    />
  )
}
