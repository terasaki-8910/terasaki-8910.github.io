import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneColor } from '../../visualization/sims/rigidKit'
import { phongSpecular, reflect } from '../../../utils/vis/shading'
import { angleFromPoint, cycleSelection, directionFromAngle, drawAngleHandle, drawPixelSphere, drawPolarLobe, drawSemicircle, hitAngleHandle, isSelectKey } from './shadingKit'

const INITIAL = { light: -38 * Math.PI / 180, view: 30 * Math.PI / 180, m: 24 }
const ORIGIN = [0, 0]
const RADIUS = 1.55
const HANDLES = ['light', 'view'] // PageUp・PageDown で選べるつまみ

export default function ShadingStep3() {
  const [lightAngle, setLightAngle] = useState(INITIAL.light)
  const [viewAngle, setViewAngle] = useState(INITIAL.view)
  const [m, setM] = useState(INITIAL.m)
  const [selected, setSelected] = useState('light')
  const dragging = useRef(null)
  const L = directionFromAngle(lightAngle)
  const V = directionFromAngle(viewAngle)
  const N = [0, 1, 0]
  const R = reflect(L, N)
  const highlight = phongSpecular(N, L, V, m)
  const viewOf = (width, height) => makeView({ width, height, xRange: [-3.2, 3.2], yRange: [-0.55, 2.55], margin: STEP_MARGIN, equal: true })

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(view.sx(-2.8), view.sy(0))
    ctx.lineTo(view.sx(2.8), view.sy(0))
    ctx.stroke()
    drawSemicircle(ctx, view, ORIGIN, RADIUS, colors)
    drawArrow(ctx, view, 0, 0, 0, 1.15, { color: colors.ink, width: 2 })
    drawText(ctx, 'N', view.sx(0) + 9, view.sy(1.15), { color: colors.ink })
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, lightAngle, colors, 'L', laneColor(colors, 0), selected === 'light')
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, viewAngle, colors, 'V', laneColor(colors, 2), selected === 'view')
    drawArrow(ctx, view, 0, 0, R[0] * 1.35, R[1] * 1.35, { color: colors.muted, width: 2 })
    drawText(ctx, 'R', view.sx(R[0] * 1.35) + 8, view.sy(R[1] * 1.35), { color: colors.ink })
    drawPolarLobe(ctx, view, ORIGIN, 1.45, colors, { L, V, m, showBlinn: false })
    drawPixelSphere(ctx, view.sx(-2.35), view.sy(1.42), Math.min(38, view.scaleX * 0.48), colors, { L: [L[0], 0, L[1]], V: [V[0], 0, V[1]], m, mode: 'phong' })
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const hit = (point) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    if (hitAngleHandle(view, ORIGIN, RADIUS, lightAngle, point)) return 'light'
    if (hitAngleHandle(view, ORIGIN, RADIUS, viewAngle, point)) return 'view'
    return null
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => {
      const handle = hit(point)
      if (!handle) return false
      dragging.current = handle
      setSelected(handle)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも操作できるように
      return undefined
    },
    onMove: (point) => {
      const angle = clamp(angleFromPoint(viewOf(sizeRef.current.width, sizeRef.current.height), ORIGIN, point), -Math.PI / 2, Math.PI / 2)
      if (dragging.current === 'light') setLightAngle(angle)
      else setViewAngle(angle)
    },
    onUp: () => { dragging.current = null },
  })
  const onKeyDown = (event) => {
    if (isSelectKey(event)) {
      event.preventDefault()
      setSelected((value) => cycleSelection(HANDLES, value, event.key))
      return
    }
    const step = arrowStep(event)
    if (!step || step.dx === 0) return // 上下のキーは使わない(ページのスクロールに残す)
    event.preventDefault()
    const update = selected === 'light' ? setLightAngle : setViewAngle
    update((value) => clamp(value + step.dx * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
  }
  const reset = () => {
    setLightAngle(INITIAL.light)
    setViewAngle(INITIAL.view)
    setM(INITIAL.m)
    setSelected('light')
  }

  return (
    <SimShell
      label="フォンの鏡面反射"
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="法線 N、光 L、視線 V、鏡方向 R と、フォンのつやの分布、ハイライトのある球を描いています。L と V のつまみをドラッグして向きを変えられます。キーでは、PageUp・PageDown で動かすつまみを L と V から選び、左右の矢印キーで 5 度ずつ動かします(Shift を押すと 5 倍)。" />}
      legend={<SimLegend items={[
        { key: 'light', symbol: '\\theta_L', label: '光の角度', value: `${fmt(lightAngle * 180 / Math.PI, 1)}°`, minChars: 8 },
        { key: 'view', symbol: '\\theta_V', label: '目の角度', value: `${fmt(viewAngle * 180 / Math.PI, 1)}°`, minChars: 8 },
        { key: 'specular', symbol: '(R\\cdot V)^m', label: '鏡面反射', value: fmt(highlight, 3), minChars: 6 },
      ]} />}
      controls={<><SimToolbar><ResetButton onClick={reset} /></SimToolbar><ParamSlider symbol="m" label="光沢度" value={m} min={1} max={128} step={1} onChange={setM} format={(v) => v.toFixed(0)} /></>}
    />
  )
}
