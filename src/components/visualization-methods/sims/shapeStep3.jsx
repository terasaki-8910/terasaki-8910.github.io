import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { deCasteljau } from '../../../utils/vis/curve'
import { cycleSelection, drawControlPoints, drawPolyline, focusOnGrab, hitControlPoint, nearestCurveSample, pageStep, rangesForAspect, sampleCurve } from './shapeKit'

const QUADRATIC = [[0.6, 0.6], [2, 2.7], [3.5, 0.8]]
const CUBIC = [[0.5, 0.6], [1.3, 2.7], [2.7, 2.5], [3.6, 0.7]]
const POINT_R = 7

const initialPoints = (degree) => (degree === 2 ? QUADRATIC : CUBIC).map((point) => point.slice())

export default function ShapeStep3() {
  const [degree, setDegree] = useState(2)
  const [points, setPoints] = useState(() => initialPoints(2))
  const [t, setT] = useState(0.45)
  const [selected, setSelected] = useState(0)
  const [selectedT, setSelectedT] = useState(false)
  const dragging = useRef(null)
  const construction = deCasteljau(points, t)
  const samples = useMemo(() => sampleCurve((u) => deCasteljau(points, u).point, 240), [points])
  const viewOf = (width, height) => makeView({ width, height, ...rangesForAspect([0, 4], [0, 3.2], width, height), margin: STEP_MARGIN })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    drawPolyline(ctx, view, samples.map((sample) => sample.point), { color: colors.ink, width: 2.25 })
    drawPolyline(ctx, view, samples.filter((sample) => sample.u <= t).map((sample) => sample.point), { color: laneColor(colors, 0), width: 3 })

    construction.levels.forEach((level, index) => {
      drawPolyline(ctx, view, level, { color: index === 0 ? colors.muted : laneColor(colors, index), width: 1.4, dash: index === 0 ? [5, 4] : [] })
      if (index > 0) level.forEach(([x, y]) => markerCircle(ctx, view.sx(x), view.sy(y), index === construction.levels.length - 1 ? POINT_R : 4, {
        fill: laneColor(colors, index), stroke: colors.ink, lineWidth: index === construction.levels.length - 1 && selectedT ? 3 : 1,
      }))
    })
    drawControlPoints(ctx, view, points, colors, { selected: selectedT ? -1 : selected })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const loop = useSimLoop((dt) => {
    setT((value) => value + dt / 3 > 1 ? 0 : value + dt / 3)
  }, { targetRef: canvasRef })

  const pointerInfo = (position) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    const control = hitControlPoint(view, points, position)
    const curve = nearestCurveSample(view, samples, position)
    const finalPoint = construction.point
    const overFinal = Math.hypot(position.x - view.sx(finalPoint[0]), position.y - view.sy(finalPoint[1])) <= POINT_R + GRAB_SLOP_PX
    return { view, control, curve, overFinal }
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => {
      const info = pointerInfo(position)
      return info.control >= 0 || info.overFinal
    },
    onDown: focusOnGrab(canvasRef, (position) => {
      const info = pointerInfo(position)
      if (info.control >= 0) {
        loop.pause() // 再生中でも、つかんだら止める
        dragging.current = { type: 'control', index: info.control }
        setSelected(info.control)
        setSelectedT(false)
        return
      }
      if (info.overFinal) {
        loop.pause()
        dragging.current = { type: 't' }
        setSelectedT(true)
        setT(info.curve.u)
        return
      }
      return false
    }),
    onMove: (position) => {
      const { view, curve } = pointerInfo(position)
      if (dragging.current?.type === 't') setT(curve.u)
      if (dragging.current?.type === 'control') {
        const index = dragging.current.index
        setPoints((current) => current.map((point, i) => i === index
          ? [clamp(view.wx(position.x), 0, 4), clamp(view.wy(position.y), 0, 3.2)]
          : point))
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    const move = pageStep(event)
    if (move) {
      event.preventDefault()
      // 制御点 → 最後に残る点 P(t) の順に巡る
      const next = cycleSelection(selected, selectedT, move, points.length)
      setSelected(next.selected)
      setSelectedT(next.onCurve)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    loop.pause()
    if (selectedT) setT((value) => clamp(value + (step.dx + step.dy) * 0.01, 0, 1))
    else setPoints((current) => current.map((point, i) => i === selected
      ? [clamp(point[0] + step.dx * 0.1, 0, 4), clamp(point[1] + step.dy * 0.1, 0, 3.2)]
      : point))
  }
  const changeDegree = (value) => {
    const next = Number(value)
    setDegree(next)
    setPoints(initialPoints(next))
    setSelected(0)
    setSelectedT(false)
  }
  const reset = () => {
    setPoints(initialPoints(degree))
    setT(0.45)
    setSelected(0)
    setSelectedT(false)
  }
  return (
    <SimShell
      label="ド・カステリョのアルゴリズム"
      switcher={<ModeSwitch label="次数" value={degree} options={[{ value: 2, label: '2 次' }, { value: 3, label: '3 次' }]} onChange={changeDegree} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="同じ t の線形補間を繰り返して作るベジエ曲線。制御点と、最後に残る点 P(t) をドラッグで動かせる。ドラッグや矢印キーを使うと、再生は止まる。矢印キー(Shift で 5 倍)で選択中の点を動かし、PageUp と PageDown で制御点と P(t) を順に選べる" />}
      legend={<SimLegend items={[
        { key: 'curve', label: 'ベジエ曲線', swatch: 'var(--color-ink)' },
        { key: 'trace', label: '0 から t まで', swatch: 'var(--lane-0)' },
        { key: 'point', symbol: 'P(t)', label: '最後に残る点', value: `(${fmt(construction.point[0], 2)}, ${fmt(construction.point[1], 2)})`, minChars: 14 },
        { key: 'levels', label: '補間の段数', value: `${degree} 段` },
      ]} />}
      controls={
        <>
          <SimToolbar><PlayPauseButton running={loop.running} onToggle={loop.toggle} /><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="t" label="共通の内分比" value={t} min={0} max={1} step={0.01} onChange={(value) => { loop.pause(); setT(value); setSelectedT(true) }} format={(value) => value.toFixed(2)} />
        </>
      }
    />
  )
}
