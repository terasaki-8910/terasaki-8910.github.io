import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes, makeView } from '../../visualization/axes'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { chebyshevUpperBound, inShadow } from '../../../utils/vis/shading'

const INITIAL = { light: [-2.3, 3.25], boxX: 0.35, rays: 32, bias: 0.04, soft: false }
const BOX = { width: 1.25, height: 1.35 }
const HALF_FOV = 70 * Math.PI / 180

const viewOf = (width, height) => makeView({ width, height, xRange: [-4.2, 4.2], yRange: [-0.35, 4.25], margin: STEP_MARGIN, equal: true })

function rayBoxDistance(light, direction, boxX) {
  const bounds = [[boxX - BOX.width / 2, boxX + BOX.width / 2], [0, BOX.height]]
  let near = -Infinity
  let far = Infinity
  for (let axis = 0; axis < 2; axis++) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (light[axis] < bounds[axis][0] || light[axis] > bounds[axis][1]) return Infinity
      continue
    }
    const a = (bounds[axis][0] - light[axis]) / direction[axis]
    const b = (bounds[axis][1] - light[axis]) / direction[axis]
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
  }
  return far >= Math.max(near, 0) ? Math.max(near, 0) : Infinity
}

function makeDepths(light, boxX, count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -HALF_FOV + 2 * HALF_FOV * (index + 0.5) / count
    const direction = [Math.sin(angle), -Math.cos(angle)]
    const floorDistance = light[1] / Math.max(1e-6, Math.cos(angle))
    return {
      angle,
      direction,
      distance: Math.min(floorDistance, rayBoxDistance(light, direction, boxX)),
    }
  })
}

function depthCell(light, x, count) {
  const angle = Math.atan2(x - light[0], light[1])
  const index = Math.floor(((angle + HALF_FOV) / (2 * HALF_FOV)) * count)
  return index >= 0 && index < count ? index : -1
}

function softVisibility(depths, index, distance) {
  const nearby = []
  for (let offset = -2; offset <= 2; offset++) {
    const sample = depths[clamp(index + offset, 0, depths.length - 1)].distance
    nearby.push(sample)
  }
  const mean = nearby.reduce((sum, value) => sum + value, 0) / nearby.length
  const meanSq = nearby.reduce((sum, value) => sum + value * value, 0) / nearby.length
  return chebyshevUpperBound(mean, meanSq, distance)
}

export default function ShadingStep8() {
  const [light, setLight] = useState(INITIAL.light)
  const [boxX, setBoxX] = useState(INITIAL.boxX)
  const [rays, setRays] = useState(INITIAL.rays)
  const [bias, setBias] = useState(INITIAL.bias)
  const [soft, setSoft] = useState(INITIAL.soft)
  const selected = useRef('light')
  const depths = makeDepths(light, boxX, rays)

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'm', yLabel: 'm' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()

    ctx.strokeStyle = colors.alpha('ink', 0.1)
    ctx.lineWidth = 1
    depths.forEach(({ direction, distance }) => {
      ctx.beginPath()
      ctx.moveTo(view.sx(light[0]), view.sy(light[1]))
      ctx.lineTo(view.sx(light[0] + direction[0] * distance), view.sy(light[1] + direction[1] * distance))
      ctx.stroke()
    })

    const samples = Math.max(140, Math.round(view.frame.width))
    const floorTop = view.sy(0)
    const floorBottom = Math.min(view.frame.bottom, floorTop + 22)
    for (let i = 0; i < samples; i++) {
      const x0 = -4.2 + 8.4 * i / samples
      const x1 = -4.2 + 8.4 * (i + 1) / samples
      const centerX = (x0 + x1) / 2
      const index = depthCell(light, centerX, rays)
      let visibility = 1
      if (index >= 0) {
        const distance = Math.hypot(centerX - light[0], light[1])
        if (soft) visibility = softVisibility(depths, index, Math.max(0, distance - bias))
        else if (inShadow(distance, depths[index].distance, bias)) visibility = 0
      }
      ctx.fillStyle = visibility < 0.35 ? colors.muted : visibility < 0.8 ? colors.alpha('muted', 0.62) : colors.paper
      ctx.fillRect(view.sx(x0), floorTop, Math.ceil(view.sx(x1) - view.sx(x0)) + 1, floorBottom - floorTop)
    }
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(view.sx(-4.2), floorTop)
    ctx.lineTo(view.sx(4.2), floorTop)
    ctx.stroke()

    const boxLeft = view.sx(boxX - BOX.width / 2)
    const boxRight = view.sx(boxX + BOX.width / 2)
    const boxTop = view.sy(BOX.height)
    ctx.fillStyle = laneColor(colors, 1)
    ctx.fillRect(boxLeft, boxTop, boxRight - boxLeft, floorTop - boxTop)
    ctx.strokeStyle = colors.ink
    ctx.strokeRect(boxLeft, boxTop, boxRight - boxLeft, floorTop - boxTop)
    drawText(ctx, '箱', (boxLeft + boxRight) / 2, boxTop + 16, { color: colors.ink, align: 'center' })
    markerCircle(ctx, view.sx(light[0]), view.sy(light[1]), 8, { fill: colors.accent, stroke: colors.ink, lineWidth: 2 })
    drawText(ctx, '光源', view.sx(light[0]) + 11, view.sy(light[1]) - 10, { color: colors.ink })

    const stripX = view.frame.left + 4
    const stripY = view.frame.top + 5
    const stripWidth = view.frame.width - 8
    const maxDistance = Math.max(...depths.map((entry) => entry.distance))
    depths.forEach((entry, index) => {
      const t = entry.distance / maxDistance
      ctx.fillStyle = t < 0.7 ? laneColor(colors, 1) : colors.paper
      const x0 = stripX + stripWidth * index / rays
      const x1 = stripX + stripWidth * (index + 1) / rays
      ctx.fillRect(x0, stripY, Math.max(1, x1 - x0), 12)
    })
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1
    ctx.strokeRect(stripX, stripY, stripWidth, 12)
    drawText(ctx, '距離表 dL', stripX, stripY + 27, { color: colors.ink })
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const hit = (point) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    if (Math.hypot(point.x - view.sx(light[0]), point.y - view.sy(light[1])) <= 21) return 'light'
    const left = view.sx(boxX - BOX.width / 2)
    const right = view.sx(boxX + BOX.width / 2)
    if (point.x >= left && point.x <= right && point.y >= view.sy(BOX.height) && point.y <= view.sy(0)) return 'box'
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
      const view = viewOf(sizeRef.current.width, sizeRef.current.height)
      if (selected.current === 'light') setLight([clamp(view.wx(point.x), -3.6, 3.6), clamp(view.wy(point.y), 1.7, 4)])
      else setBoxX(clamp(view.wx(point.x), -3.4, 3.4))
    },
  })
  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      selected.current = selected.current === 'light' ? 'box' : 'light'
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selected.current === 'light') setLight(([x, y]) => [clamp(x + step.dx * 0.1, -3.6, 3.6), clamp(y + step.dy * 0.1, 1.7, 4)])
    else setBoxX((value) => clamp(value + step.dx * 0.1, -3.4, 3.4))
  }
  const reset = () => {
    setLight(INITIAL.light)
    setBoxX(INITIAL.boxX)
    setRays(INITIAL.rays)
    setBias(INITIAL.bias)
    setSoft(INITIAL.soft)
    selected.current = 'light'
  }
  const centerIndex = depthCell(light, 0, rays)
  const centerDepth = centerIndex >= 0 ? depths[centerIndex].distance : Infinity

  return (
    <SimShell
      label="シャドウマップ"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="点光源から箱と床へ飛ぶ光線、方向ごとの距離表、床の影を描いています。光源または箱をドラッグし、矢印キーで選択中の対象を動かせます。PageUpとPageDownで操作対象を切り替えます。" />}
      legend={<SimLegend items={[
        { key: 'light', symbol: 'L', label: '光源位置', value: `(${fmt(light[0], 2)}, ${fmt(light[1], 2)}) m`, minChars: 16 },
        { key: 'box', label: '箱の中心', value: `${fmt(boxX, 2)} m`, minChars: 8 },
        { key: 'depth', symbol: 'd_L', label: '中央セルの距離', value: Number.isFinite(centerDepth) ? `${fmt(centerDepth, 2)} m` : '範囲外', minChars: 9 },
      ]} />}
      controls={<><SimToolbar><ResetButton onClick={reset} /><ToggleButton pressed={soft} onChange={setSoft}>やわらかい影（VSM）</ToggleButton></SimToolbar><ParamSlider symbol="N" label="光線数" value={rays} min={8} max={256} step={8} onChange={setRays} format={(v) => v.toFixed(0)} /><ParamSlider symbol="\varepsilon" label="影のずらし" value={bias} min={0} max={0.2} step={0.005} unit="m" onChange={setBias} format={(v) => v.toFixed(3)} /></>}
    />
  )
}
