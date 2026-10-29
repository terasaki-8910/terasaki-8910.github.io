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
import { LOBE_BLINN_DASH, angleBetween, angleFromPoint, cycleSelection, directionFromAngle, drawAngleHandle, drawPolarLobe, drawSemicircle, hitAngleHandle, isSelectKey } from './shadingKit'

const INITIAL = { light: -40 * Math.PI / 180, view: 28 * Math.PI / 180, m: 20 }
const ORIGIN = [0, 0]
const RADIUS = 1.55
const HANDLES = ['light', 'view'] // PageUp・PageDown で選べるつまみ

export default function ShadingStep4() {
  const [lightAngle, setLightAngle] = useState(INITIAL.light)
  const [viewAngle, setViewAngle] = useState(INITIAL.view)
  const [m, setM] = useState(INITIAL.m)
  const [matchSpread, setMatchSpread] = useState(true)
  const [selected, setSelected] = useState('light')
  const dragging = useRef(null)
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
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, lightAngle, colors, 'L', laneColor(colors, 0), selected === 'light')
    drawAngleHandle(ctx, view, ORIGIN, RADIUS, viewAngle, colors, 'V', laneColor(colors, 2), selected === 'view')
    drawArrow(ctx, view, 0, 0, R[0] * 1.3, R[1] * 1.3, { color: colors.ink, width: 1.5 })
    drawText(ctx, 'R', view.sx(R[0] * 1.3) + 8, view.sy(R[1] * 1.3), { color: colors.ink })
    drawArrow(ctx, view, 0, 0, H[0] * 1.2, H[1] * 1.2, { color: colors.muted, width: 2 })
    drawText(ctx, 'H', view.sx(H[0] * 1.2) - 9, view.sy(H[1] * 1.2), { color: colors.ink, align: 'right' })
    drawPolarLobe(ctx, view, ORIGIN, 1.45, colors, { L, V, m, matchSpread })
    ctx.restore()
    // 2 本の分布の見分け方(線の見本つきの名前)。文字は ink、線の違い(実線・破線)と色は見本で示す
    ctx.save()
    const keyX = view.frame.left + 4
    ;[
      { name: 'フォン', y: view.frame.top + 13, color: colors.ink, dash: [] },
      { name: 'ブリン-フォン', y: view.frame.top + 30, color: colors.muted, dash: LOBE_BLINN_DASH },
    ].forEach(({ name, y, color, dash }) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash(dash)
      ctx.beginPath()
      ctx.moveTo(keyX, y - 4)
      ctx.lineTo(keyX + 20, y - 4)
      ctx.stroke()
      drawText(ctx, name, keyX + 26, y, { color: colors.ink })
    })
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
    setMatchSpread(true)
    setSelected('light')
  }

  return (
    <SimShell
      label="ブリン-フォンのハーフベクトル"
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="法線 N、光 L、視線 V、鏡方向 R、ハーフベクトル H と、フォンとブリン-フォンの 2 つのつやの分布(フォンは実線、ブリン-フォンは破線)を描いています。L と V のつまみをドラッグして向きを変えられます。キーでは、PageUp・PageDown で動かすつまみを L と V から選び、左右の矢印キーで 5 度ずつ動かします(Shift を押すと 5 倍)。" />}
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
