import { useEffect, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { fresnelSchlick, reflectIncident, refract } from '../../../utils/vis/shading'
import { drawSubLabel } from './labelKit'

const INITIAL = { theta: 42 * Math.PI / 180, eta1: 1, eta2: 1.5 }

function geometry(width, height, theta) {
  const center = [width / 2, height * 0.48]
  const radius = Math.min(width * 0.34, height * 0.36, 110)
  return {
    center,
    radius,
    source: [center[0] - Math.sin(theta) * radius, center[1] - Math.cos(theta) * radius],
  }
}

function drawRay(ctx, start, end, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(start[0], start[1])
  ctx.lineTo(end[0], end[1])
  ctx.stroke()
}

function drawArc(ctx, center, radius, from, to, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(center[0], center[1], radius, from, to, from > to)
  ctx.stroke()
}

export default function ShadingStep7() {
  const [theta, setTheta] = useState(INITIAL.theta)
  const [eta1, setEta1] = useState(INITIAL.eta1)
  const [eta2, setEta2] = useState(INITIAL.eta2)
  const I = [Math.sin(theta), -Math.cos(theta), 0]
  const N = [0, 1, 0]
  const R = reflectIncident(I, N)
  const T = refract(I, N, eta1 / eta2)
  const phi = T ? Math.acos(clamp(-T[1], -1, 1)) : null
  const critical = eta1 > eta2 ? Math.asin(eta2 / eta1) : null
  const F0 = ((eta1 - eta2) / (eta1 + eta2)) ** 2
  const reflected = T ? fresnelSchlick(F0, Math.cos(theta)) : 1

  const draw = ({ ctx, width, height, colors }) => {
    const { center, radius, source } = geometry(width, height, theta)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = colors.alpha('lane-2', 0.08)
    ctx.fillRect(0, center[1], width, height - center[1])
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(12, center[1])
    ctx.lineTo(width - 12, center[1])
    ctx.stroke()
    // 法線(破線)。line(1.3:1)ではなく muted
    ctx.save()
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1.25
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(center[0], center[1] - radius - 12)
    ctx.lineTo(center[0], center[1] + radius + 12)
    ctx.stroke()
    ctx.restore()

    drawRay(ctx, source, center, laneColor(colors, 0), 2.5)
    const reflectedEnd = [center[0] + R[0] * radius, center[1] - R[1] * radius]
    drawRay(ctx, center, reflectedEnd, colors.ink, 1.5 + reflected * 4.5)
    if (T) {
      const refractedEnd = [center[0] + T[0] * radius, center[1] - T[1] * radius]
      drawRay(ctx, center, refractedEnd, laneColor(colors, 2), 1.5 + (1 - reflected) * 4.5)
      drawText(ctx, 'T', refractedEnd[0] + 8, refractedEnd[1], { color: colors.ink, baseline: 'middle' })
      drawArc(ctx, center, 30, Math.PI / 2, Math.PI / 2 - phi, laneColor(colors, 2))
      drawText(ctx, 'φ', center[0] + 34 * Math.sin(phi / 2), center[1] + 34 * Math.cos(phi / 2), { color: colors.ink })
    } else {
      drawText(ctx, '全反射', center[0] + 12, center[1] + 26, { color: colors.ink })
    }
    drawText(ctx, 'R', reflectedEnd[0] + 8, reflectedEnd[1], { color: colors.ink, baseline: 'middle' })
    drawArc(ctx, center, 24, -Math.PI / 2 - theta, -Math.PI / 2, laneColor(colors, 0))
    drawText(ctx, 'θ', center[0] - 30 * Math.sin(theta / 2), center[1] - 30 * Math.cos(theta / 2), { color: colors.ink, align: 'right' })
    markerCircle(ctx, source[0], source[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })
    drawText(ctx, 'I', source[0] - 10, source[1], { color: colors.ink, align: 'right', baseline: 'middle' })
    drawSubLabel(ctx, `上 η_1 = ${eta1.toFixed(2)}`, 16, center[1] - 12, { color: colors.ink })
    drawSubLabel(ctx, `下 η_2 = ${eta2.toFixed(2)}`, 16, center[1] + 18, { color: colors.ink })
    drawText(ctx, '目安  空気 1.00・水 1.33・ガラス 1.50', width - 14, height - 10, { color: colors.ink, align: 'right' })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const hit = (point) => {
    const source = geometry(sizeRef.current.width, sizeRef.current.height, theta).source
    return Math.hypot(point.x - source[0], point.y - source[1]) <= 20
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも操作できるように
      return undefined
    },
    onMove: (point) => {
      const { center } = geometry(sizeRef.current.width, sizeRef.current.height, theta)
      setTheta(clamp(Math.atan2(center[0] - point.x, center[1] - point.y), 0, 89 * Math.PI / 180))
    },
  })
  // つまみは法線の左にあり、入射角が大きいほど左へ寄る。キーはつまみが動く向き(→ で右、つまり入射角が小さく)にそろえる
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step || step.dx === 0) return // 上下のキーは使わない(ページのスクロールに残す)
    event.preventDefault()
    setTheta((value) => clamp(value - step.dx * 2 * Math.PI / 180, 0, 89 * Math.PI / 180))
  }
  const reset = () => {
    setTheta(INITIAL.theta)
    setEta1(INITIAL.eta1)
    setEta2(INITIAL.eta2)
  }

  return (
    <SimShell
      label="反射と屈折"
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="水平な境界へ入る光 I と、その反射光 R、屈折光 T を描いています。入射光 I のつまみをドラッグするか、左右の矢印キーでつまみを動かして入射角を変えられます(2 度ずつ。Shift を押すと 5 倍)。右へ動かすと入射角は小さくなります。" />}
      legend={<SimLegend items={[
        { key: 'theta', symbol: '\\theta', label: '入射角', value: `${fmt(theta * 180 / Math.PI, 1)}°`, minChars: 7 },
        { key: 'phi', symbol: '\\phi', label: '屈折角', value: phi === null ? '全反射' : `${fmt(phi * 180 / Math.PI, 1)}°`, minChars: 7 },
        { key: 'critical', symbol: '\\theta_c', label: '臨界角', value: critical === null ? 'なし' : `${fmt(critical * 180 / Math.PI, 1)}°`, minChars: 7 },
        { key: 'reflectance', symbol: 'F', label: '反射する割合', value: fmt(reflected, 3), minChars: 6 },
      ]} />}
      controls={<><SimToolbar><ResetButton onClick={reset} /></SimToolbar><ParamSlider symbol="\eta_1" label="上側の屈折率" value={eta1} min={1} max={2.4} step={0.01} onChange={setEta1} format={(v) => v.toFixed(2)} /><ParamSlider symbol="\eta_2" label="下側の屈折率" value={eta2} min={1} max={2.4} step={0.01} onChange={setEta2} format={(v) => v.toFixed(2)} /></>}
    />
  )
}
