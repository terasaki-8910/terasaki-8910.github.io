import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { uvSphere } from '../../../utils/vis/mesh'
import { faceNormal, vertexNormals } from '../../../utils/vis/shading'
import { cameraViewProjection, projectVertex, renderScene } from '../../../utils/vis/render'
import { tokenRgb } from './shadingKit'

const CAMERA = { eye: [0, 0.35, 4.2], target: [0, 0, 0], up: [0, 1, 0], fov: 38 * Math.PI / 180 }
const INITIAL = { segments: 10, yaw: -20 * Math.PI / 180, pitch: 12 * Math.PI / 180 }

const rotate = (point, yaw, pitch) => {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const x = cy * point[0] + sy * point[2]
  const z = -sy * point[0] + cy * point[2]
  return [x, cp * point[1] - sp * z, sp * point[1] + cp * z]
}

const drawScreenArrow = (ctx, from, to, color, width = 1.5) => {
  if (!from || !to) return
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(from[0], from[1])
  ctx.lineTo(to[0], to[1])
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(to[0], to[1])
  ctx.lineTo(to[0] - Math.cos(angle - 0.45) * 7, to[1] - Math.sin(angle - 0.45) * 7)
  ctx.lineTo(to[0] - Math.cos(angle + 0.45) * 7, to[1] - Math.sin(angle + 0.45) * 7)
  ctx.closePath()
  ctx.fill()
}

export default function ShadingStep1() {
  const [segments, setSegments] = useState(INITIAL.segments)
  const [yaw, setYaw] = useState(INITIAL.yaw)
  const [pitch, setPitch] = useState(INITIAL.pitch)
  const [selectedFace, setSelectedFace] = useState(2)
  const [showFaces, setShowFaces] = useState(true)
  const [showVertices, setShowVertices] = useState(false)
  const offscreen = useRef(null)
  const dragging = useRef(false)
  const mesh = useMemo(() => {
    const source = uvSphere(1, segments, Math.round(segments / 2))
    const positions = source.positions.map((point) => rotate(point, yaw, pitch))
    return { positions, faces: source.faces, normals: vertexNormals(positions, source.faces) }
  }, [segments, yaw, pitch])
  const safeFace = Math.min(selectedFace, mesh.faces.length - 1)
  const selected = mesh.faces[safeFace]
  const selectedNormal = faceNormal(mesh.positions[selected[0]], mesh.positions[selected[1]], mesh.positions[selected[2]])

  const draw = ({ ctx, width, height, colors }) => {
    const renderWidth = Math.max(2, Math.round(Math.min(640, width) * (dragging.current ? 0.5 : 1)))
    const renderHeight = Math.max(2, Math.round(renderWidth * height / Math.max(width, 1)))
    if (!offscreen.current) offscreen.current = document.createElement('canvas')
    offscreen.current.width = renderWidth
    offscreen.current.height = renderHeight
    const bufferCtx = offscreen.current.getContext('2d')
    const pixels = new Uint8ClampedArray(renderWidth * renderHeight * 4)
    renderScene({
      meshes: [{ ...mesh, material: { color: tokenRgb(colors, 'lane-1'), kd: 0.8, ks: 0, kind: 'paint' } }],
      light: { position: [2.5, 3, 3], intensity: 1 },
      ambient: 0.16,
      environment: (direction, out) => {
        const rgb = colors.rgb.surface
        out[0] = rgb[0] / 255
        out[1] = rgb[1] / 255
        out[2] = rgb[2] / 255
        return out
      },
    }, CAMERA, { width: renderWidth, height: renderHeight, shading: 'flat', model: 'lambert', shadows: false }, pixels)
    bufferCtx.putImageData(new ImageData(pixels, renderWidth, renderHeight), 0, 0)
    ctx.drawImage(offscreen.current, 0, 0, width, height)

    const VP = cameraViewProjection(CAMERA, width / height)
    const project = (point) => projectVertex(VP, point, width, height)
    const drawNormal = (center, normal, color, length = 0.18) => drawScreenArrow(ctx, project(center), project([
      center[0] + normal[0] * length,
      center[1] + normal[1] * length,
      center[2] + normal[2] * length,
    ]), color, 1)
    if (showFaces) mesh.faces.forEach((face) => {
      const A = mesh.positions[face[0]]
      const B = mesh.positions[face[1]]
      const C = mesh.positions[face[2]]
      const projected = [project(A), project(B), project(C)]
      const area = (projected[1][0] - projected[0][0]) * (projected[2][1] - projected[0][1]) - (projected[1][1] - projected[0][1]) * (projected[2][0] - projected[0][0])
      if (area >= 0) return
      drawNormal([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], faceNormal(A, B, C), colors.ink)
    })
    if (showVertices) mesh.positions.forEach((point, index) => {
      const normal = mesh.normals[index]
      const towardEye = CAMERA.eye[0] - point[0]
      const towardEyeY = CAMERA.eye[1] - point[1]
      const towardEyeZ = CAMERA.eye[2] - point[2]
      if (normal[0] * towardEye + normal[1] * towardEyeY + normal[2] * towardEyeZ > 0) drawNormal(point, normal, colors.muted, 0.2)
    })

    const A = mesh.positions[selected[0]]
    const B = mesh.positions[selected[1]]
    const C = mesh.positions[selected[2]]
    const a = project(A)
    const b = project(B)
    const c = project(C)
    ctx.fillStyle = colors.alpha('lane-0', 0.2)
    ctx.strokeStyle = laneColor(colors, 0)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.lineTo(c[0], c[1])
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    drawScreenArrow(ctx, a, b, laneColor(colors, 0), 2)
    drawScreenArrow(ctx, a, c, laneColor(colors, 2), 2)
    ;[[a, 'A'], [b, 'B'], [c, 'C']].forEach(([point, label]) => {
      markerCircle(ctx, point[0], point[1], 4, { fill: colors.accent, stroke: colors.ink, lineWidth: 1 })
      drawText(ctx, label, point[0] + 7, point[1] - 7, { color: colors.ink })
    })
    const center = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]
    const nEnd = [center[0] + selectedNormal[0] * 0.55, center[1] + selectedNormal[1] * 0.55, center[2] + selectedNormal[2] * 0.55]
    drawScreenArrow(ctx, project(center), project(nEnd), colors.ink, 2.5)
    const label = project(nEnd)
    drawText(ctx, 'n', label[0] + 7, label[1], { color: colors.ink })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() })
  const pickFace = (point) => {
    const { width, height } = sizeRef.current
    const VP = cameraViewProjection(CAMERA, width / Math.max(height, 1))
    let best = -1
    let distance = Infinity
    mesh.faces.forEach((face, index) => {
      const projected = face.map((vertex) => projectVertex(VP, mesh.positions[vertex], width, height))
      if (projected.some((value) => !value)) return
      const area = (projected[1][0] - projected[0][0]) * (projected[2][1] - projected[0][1]) - (projected[1][1] - projected[0][1]) * (projected[2][0] - projected[0][0])
      if (area >= 0) return
      const x = (projected[0][0] + projected[1][0] + projected[2][0]) / 3
      const y = (projected[0][1] + projected[1][1] + projected[2][1]) / 3
      const d = Math.hypot(point.x - x, point.y - y)
      if (d < distance) {
        distance = d
        best = index
      }
    })
    return distance < 34 ? best : -1
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => pickFace(point) >= 0,
    onDown: (point) => {
      const face = pickFace(point)
      if (face < 0) return false
      setSelectedFace(face)
      dragging.current = true
      redraw()
    },
    onMove: ({ dx, dy }) => {
      setYaw((value) => value + dx * 0.01)
      setPitch((value) => clamp(value - dy * 0.01, -Math.PI / 2, Math.PI / 2))
    },
    onUp: () => {
      dragging.current = false
      redraw()
    },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setYaw((value) => value + step.dx * 5 * Math.PI / 180)
    setPitch((value) => clamp(value + step.dy * 5 * Math.PI / 180, -Math.PI / 2, Math.PI / 2))
  }
  const reset = () => {
    setSegments(INITIAL.segments)
    setYaw(INITIAL.yaw)
    setPitch(INITIAL.pitch)
    setSelectedFace(2)
    setShowFaces(true)
    setShowVertices(false)
  }

  return (
    <SimShell
      label="面の向きと法線"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="三角形でできた球と面法線・頂点法線を描いています。球の三角形をクリックして選び、そのままドラッグするか矢印キーで回転できます。" />}
      legend={<SimLegend items={[
        { key: 'face', label: '選択面', value: `#${safeFace}`, minChars: 6 },
        { key: 'normal', symbol: 'n', label: '面法線', value: `(${selectedNormal.map((v) => fmt(v, 3)).join(', ')})`, minChars: 23 },
        { key: 'triangles', label: '三角形', value: String(mesh.faces.length), minChars: 6 },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /><ToggleButton pressed={showFaces} onChange={setShowFaces}>面法線</ToggleButton><ToggleButton pressed={showVertices} onChange={setShowVertices}>頂点法線</ToggleButton></SimToolbar>
          <ParamSlider symbol="N" label="球の分割数" value={segments} min={6} max={24} step={2} onChange={(value) => { setSegments(value); setSelectedFace(0) }} format={(v) => v.toFixed(0)} />
        </>
      }
    />
  )
}
