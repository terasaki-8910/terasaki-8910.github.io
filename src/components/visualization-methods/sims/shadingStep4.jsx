import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneColor } from '../../visualization/sims/rigidKit'
import { blinnPhongSpecular, halfVector, phongSpecular, reflect } from '../../../utils/vis/shading'
import { angleBetween, angleFromPoint, directionFromAngle, drawAngleHandle, drawPolarLobe, drawSemicircle, hitAngleHandle } from './shadingKit'

const INITIAL = { light: -40 * Math.PI / 180, view: 28 * Math.PI / 180, m: 20 }
const ORIGIN = [0, 0]
const RADIUS = 1.55

export default function ShadingStep4() {
  const [lightAngle, setLightAngle] = useState(INITIAL.light)
  const [viewAngle, setViewAngle] = useState(INITIAL.view)
  const [m, setM] = useState(INITIAL.m)
  const [matchSpread, setMatchSpread] = useState(true)
  const selected = useRef('light')
  const L = directionFromAngle(lightAngle)
  const V = directionFromAngle(viewAngle)
  const N = [0, 1, 0]
  const R = reflect(L, N)
  const H = halfVector(L, V)
  const rvAngle = angleBetween(R, V)
  const nhAngle = angleBetween(N, H)
  const blinnM = matchSpread ? 4 * m : m
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
    drawText(ctx, 'N', view.sx(0) + 8, view.sy(1.15), { color: colors.ink })
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, lightAngle, colors, 'L', laneColor(colors, 0))
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, viewAngle, colors, 'V', laneColor(colors, 2))
    drawArrow(ctx, view, 0, 0, R[0] * 1.3, R[1] * 1.3, { color: colors.ink, width: 1.5 })
    drawText(ctx, 'R', view.sx(R[0] * 1.3) + 8, view.sy(R[1] * 1.3), { color: colors.ink })
    drawArrow(ctx, view, 0, 0, H[0] * 1.2, H[1] * 1.2, { color: colors.muted, width: 2 })
    drawText(ctx, 'H', view.sx(H[0] * 1.2) - 9, view.sy(H[1] * 1.2), { color: colors.ink, align: 'right' })
    drawPolarLobe(ctx, view, ORIGIN, 1.45, colors, { L, V, m, matchSpread })
    ctx.restore()
    drawText(ctx, 'フォン', view.frame.left + 4, view.frame.top + 13, { color: colors.ink })
    drawText(ctx, 'ブリン-フォン', view.frame.left + 4, view.frame.top + 30, { color: colors.muted })
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
      selected.current = handle
    },
    onMove: (point) => {
      const angle = clamp(angleFromPoint(viewOf(sizeRef.current.width, sizeRef.current.height), ORIGIN, point), -Math.PI / 2, Math.PI / 2)
      if (selected.current === 'light') setLightAngle(angle)
      else setViewAngle(angle)
    },
  })
  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      selected.current = selected.current === 'light' ? 'view' : 'light'
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const update = selected.current === 'light' ? setLightAngle : setViewAngle
    update((value) => clamp(value + step.dx * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
  }
  const reset = () => {
    setLightAngle(INITIAL.light)
    setViewAngle(INITIAL.view)
    setM(INITIAL.m)
    setMatchSpread(true)
    selected.current = 'light'
  }

  return (
    <SimShell
      label="ブリン-フォンのハーフベクトル"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="法線N、光L、視線V、鏡方向R、ハーフベクトルHと二つのハイライト分布を描いています。LまたはVをドラッグし、矢印キーで選択中の向きを動かせます。PageUpとPageDownで操作対象を切り替えます。" />}
      legend={<SimLegend items={[
        { key: 'rv', symbol: '\\angle(R,V)', label: '鏡方向との差', value: `${fmt(rvAngle * 180 / Math.PI, 1)}°`, minChars: 8 },
        { key: 'nh', symbol: '\\angle(N,H)', label: '法線との差', value: `${fmt(nhAngle * 180 / Math.PI, 1)}°`, minChars: 8 },
        { key: 'phong', label: 'フォン', value: fmt(phongSpecular(N, L, V, m), 3), swatch: 'var(--color-ink)', minChars: 6 },
        { key: 'blinn', label: `ブリン-フォン (m=${blinnM})`, value: fmt(blinnPhongSpecular(N, L, V, blinnM), 3), swatch: 'var(--color-muted)', minChars: 6 },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /><ToggleButton pressed={matchSpread} onChange={setMatchSpread}>広がりをそろえる</ToggleButton></SimToolbar>
          <ParamSlider symbol="m" label="フォンの光沢度" value={m} min={1} max={128} step={1} onChange={setM} format={(v) => v.toFixed(0)} />
        </>
      }
    />
  )
}
