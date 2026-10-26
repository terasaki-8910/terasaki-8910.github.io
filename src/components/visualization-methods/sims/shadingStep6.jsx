import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { barycentric, rasterTriangle } from '../../../utils/vis/raster'
import { blinnPhongSpecular, lambert } from '../../../utils/vis/shading'
import { normalize } from '../../../utils/vis/vec3'

const INITIAL = { angle: 0, weights: [0.28, 0.34, 0.38] }
const NORMALS = [
  normalize([-0.72, -0.48, 0.5]),
  normalize([0.72, -0.48, 0.5]),
  normalize([0, 0.78, 0.63]),
]
const V = [0, 0, 1]

function triangles(width, height) {
  const half = width / 2
  const top = Math.max(76, height * 0.27)
  const bottom = height - 24
  const pad = Math.max(12, width * 0.035)
  return [
    [[pad, bottom], [half - pad, bottom], [half / 2, top]],
    [[half + pad, bottom], [width - pad, bottom], [half + half / 2, top]],
  ]
}

function pointFromWeights(vertices, weights) {
  return [
    weights[0] * vertices[0][0] + weights[1] * vertices[1][0] + weights[2] * vertices[2][0],
    weights[0] * vertices[0][1] + weights[1] * vertices[1][1] + weights[2] * vertices[2][1],
  ]
}

function constrainedWeights(point, vertices) {
  const weights = barycentric(point, vertices[0], vertices[1], vertices[2])
  const clipped = weights.map((value) => Math.max(0, value))
  const sum = clipped[0] + clipped[1] + clipped[2]
  return sum > 0 ? clipped.map((value) => value / sum) : [1 / 3, 1 / 3, 1 / 3]
}

function lightPoint(width, angle) {
  const radius = Math.min(52, width * 0.13)
  return [width / 2 + Math.sin(angle) * radius, 60 - Math.cos(angle) * radius * 0.55]
}

function shade(normal, light) {
  return 0.12 + 0.5 * lambert(normal, light) + 0.85 * blinnPhongSpecular(normal, light, V, 72)
}

export default function ShadingStep6() {
  const [angle, setAngle] = useState(INITIAL.angle)
  const [weights, setWeights] = useState(INITIAL.weights)
  const selected = useRef('light')
  const L = normalize([Math.sin(angle), -0.08, Math.cos(angle)])
  const vertexValues = NORMALS.map((normal) => shade(normal, L))
  const interpolatedNormal = normalize([
    weights[0] * NORMALS[0][0] + weights[1] * NORMALS[1][0] + weights[2] * NORMALS[2][0],
    weights[0] * NORMALS[0][1] + weights[1] * NORMALS[1][1] + weights[2] * NORMALS[2][1],
    weights[0] * NORMALS[0][2] + weights[1] * NORMALS[1][2] + weights[2] * NORMALS[2][2],
  ])
  const gouraudValue = weights.reduce((sum, weight, i) => sum + weight * vertexValues[i], 0)
  const phongValue = shade(interpolatedNormal, L)

  const draw = ({ ctx, width, height, colors }) => {
    const tris = triangles(width, height)
    const image = ctx.createImageData(width, height)
    const surface = colors.rgb.surface
    for (let i = 0; i < width * height; i++) {
      const offset = i * 4
      image.data[offset] = surface[0]
      image.data[offset + 1] = surface[1]
      image.data[offset + 2] = surface[2]
      image.data[offset + 3] = 255
    }
    const base = colors.rgb['lane-1']
    const paper = colors.rgb.paper
    tris.forEach((vertices, mode) => {
      rasterTriangle(vertices[0], vertices[1], vertices[2], width, height, (x, y, l0, l1, l2) => {
        let value
        if (mode === 0) value = l0 * vertexValues[0] + l1 * vertexValues[1] + l2 * vertexValues[2]
        else {
          const normal = normalize([
            l0 * NORMALS[0][0] + l1 * NORMALS[1][0] + l2 * NORMALS[2][0],
            l0 * NORMALS[0][1] + l1 * NORMALS[1][1] + l2 * NORMALS[2][1],
            l0 * NORMALS[0][2] + l1 * NORMALS[1][2] + l2 * NORMALS[2][2],
          ])
          value = shade(normal, L)
        }
        const diffuse = clamp(value, 0, 1.5)
        const offset = (y * width + x) * 4
        for (let channel = 0; channel < 3; channel++) image.data[offset + channel] = Math.min(255, base[channel] * Math.min(1, diffuse) + paper[channel] * Math.max(0, diffuse - 0.55) * 0.75)
      })
    })
    ctx.putImageData(image, 0, 0)

    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    tris.forEach((vertices) => {
      ctx.beginPath()
      ctx.moveTo(vertices[0][0], vertices[0][1])
      ctx.lineTo(vertices[1][0], vertices[1][1])
      ctx.lineTo(vertices[2][0], vertices[2][1])
      ctx.closePath()
      ctx.stroke()
      vertices.forEach((vertex, i) => {
        markerCircle(ctx, vertex[0], vertex[1], 4, { fill: laneColor(colors, i), stroke: colors.ink, lineWidth: 1 })
      })
      const probe = pointFromWeights(vertices, weights)
      markerCircle(ctx, probe[0], probe[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })
    })
    drawText(ctx, 'グロー', width * 0.25, 17, { color: colors.ink, align: 'center' })
    drawText(ctx, 'フォン', width * 0.75, 17, { color: colors.ink, align: 'center' })

    const radius = Math.min(52, width * 0.13)
    ctx.strokeStyle = colors.line
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.ellipse(width / 2, 60, radius, radius * 0.55, 0, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const light = lightPoint(width, angle)
    ctx.strokeStyle = laneColor(colors, 0)
    ctx.beginPath()
    ctx.moveTo(width / 2, 63)
    ctx.lineTo(light[0], light[1])
    ctx.stroke()
    markerCircle(ctx, light[0], light[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.5 })
    drawText(ctx, 'L', light[0] + 10, light[1], { color: colors.ink, baseline: 'middle' })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() })
  const hit = (point) => {
    const { width, height } = sizeRef.current
    const light = lightPoint(width, angle)
    if (Math.hypot(point.x - light[0], point.y - light[1]) <= 20) return 'light'
    const probes = triangles(width, height).map((vertices) => pointFromWeights(vertices, weights))
    const probeIndex = probes.findIndex((probe) => Math.hypot(point.x - probe[0], point.y - probe[1]) <= 20)
    return probeIndex >= 0 ? `probe-${probeIndex}` : null
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => {
      const handle = hit(point)
      if (!handle) return false
      selected.current = handle
    },
    onMove: (point) => {
      const { width, height } = sizeRef.current
      if (selected.current === 'light') {
        setAngle(clamp(Math.asin(clamp((point.x - width / 2) / Math.min(52, width * 0.13), -1, 1)), -Math.PI / 2, Math.PI / 2))
      } else {
        const index = selected.current === 'probe-1' ? 1 : 0
        setWeights(constrainedWeights([point.x, point.y], triangles(width, height)[index]))
      }
    },
  })
  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      selected.current = selected.current === 'light' ? 'probe-0' : 'light'
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selected.current === 'light') setAngle((value) => clamp(value + step.dx * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
    else {
      const { width, height } = sizeRef.current
      const index = selected.current === 'probe-1' ? 1 : 0
      const vertices = triangles(width, height)[index]
      const point = pointFromWeights(vertices, weights)
      setWeights(constrainedWeights([point[0] + step.dx * 4, point[1] - step.dy * 4], vertices))
    }
  }
  const reset = () => {
    setAngle(INITIAL.angle)
    setWeights(INITIAL.weights)
    selected.current = 'light'
  }

  return (
    <SimShell
      label="グローとフォンシェーディング"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="同じ頂点法線を使い、左は頂点の色、右は画素の法線を補間した三角形です。Lまたは三角形内の点をドラッグし、矢印キーで選択中の対象を動かせます。PageUpとPageDownで操作対象を切り替えます。" />}
      legend={<SimLegend items={[
        { key: 'l0', symbol: '\\lambda_0', label: '左下の重み', value: fmt(weights[0], 3), swatch: 'var(--lane-0)', minChars: 6 },
        { key: 'l1', symbol: '\\lambda_1', label: '右下の重み', value: fmt(weights[1], 3), swatch: 'var(--lane-1)', minChars: 6 },
        { key: 'l2', symbol: '\\lambda_2', label: '上の重み', value: fmt(weights[2], 3), swatch: 'var(--lane-2)', minChars: 6 },
        { key: 'values', label: '明るさ（グロー／フォン）', value: `${fmt(gouraudValue, 2)} / ${fmt(phongValue, 2)}`, minChars: 12 },
      ]} />}
      controls={<SimToolbar><ResetButton onClick={reset} /></SimToolbar>}
    />
  )
}
