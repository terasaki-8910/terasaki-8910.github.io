import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ResetButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { bezierPatch } from '../../../utils/vis/curve'
import { orbitPose, cameraMatrices } from '../../visualization/sims/transformCamera'
import { projectPoint, drawLine3d, drawArrow3d, drawDot3d, drawText3d } from '../../visualization/sims/transformMesh'

const HEIGHTS = [
  [0, 0.2, -0.1, 0],
  [-0.15, 1, 0.55, 0.1],
  [0.1, 0.45, -0.65, -0.15],
  [0, -0.1, 0.15, 0],
]
const GRID = [-1.5, -0.5, 0.5, 1.5]
const POINT_R = 6

const initialPatch = () => GRID.map((x, i) => GRID.map((z, j) => [x, HEIGHTS[i][j], z]))
const addScaled = (point, vector, scale) => point.map((value, index) => value + vector[index] * scale)
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

const drawAxes = (ctx, VP, rect, colors) => {
  for (const [name, direction] of Object.entries(AXES)) {
    const end = direction.map((value) => value * 2)
    const tip = direction.map((value) => value * 2.35)
    drawArrow3d(ctx, VP, rect, [0, 0, 0], end, { color: colors.ink, width: 1.5, head: 8 })
    drawDot3d(ctx, VP, rect, direction, { fill: colors.ink, radius: 2 })
    drawText3d(ctx, VP, rect, tip, name, { color: colors.ink, size: 12 })
  }
}

export default function ShapeStep8() {
  const [patch, setPatch] = useState(initialPatch)
  const [u, setU] = useState(0.52)
  const [v, setV] = useState(0.46)
  const [selected, setSelected] = useState(5)
  const [yaw, setYaw] = useState(0.68)
  const [pitch, setPitch] = useState(0.42)
  const dragging = useRef(null)
  const current = bezierPatch(patch, u, v)

  const sceneOf = (width, height) => {
    const rect = { left: 24, top: 18, right: width - 18, bottom: height - 20, width: width - 42, height: height - 38 }
    const aspect = rect.width / Math.max(rect.height, 1)
    const distance = clamp(5.4 - Math.max(0, aspect - 1) * 0.65, 4.2, 5.4)
    const pose = orbitPose({ target: [0, 0, 0], yaw, pitch, dist: distance })
    const { VP } = cameraMatrices(pose, { fov: Math.PI / 4, aspect, near: 0.1, far: 100 })
    return { rect, VP }
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { rect, VP } = sceneOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, VP, rect, colors)
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.clip()

    const resolution = 16
    const grid = Array.from({ length: resolution + 1 }, (_, i) => Array.from({ length: resolution + 1 }, (_, j) => {
      const value = bezierPatch(patch, i / resolution, j / resolution)
      return { ...value, screen: projectPoint(VP, value.point, rect) }
    }))
    const lightLength = Math.hypot(0.35, -0.82, 0.45)
    const light = [0.35 / lightLength, -0.82 / lightLength, 0.45 / lightLength]
    const quads = []
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const corners = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
        quads.push({
          corners,
          depth: corners.reduce((sum, corner) => sum + corner.screen.ndc[2], 0) / 4,
          brightness: Math.max(0, dot(grid[i][j].normal, light)),
        })
      }
    }
    quads.sort((a, b) => b.depth - a.depth).forEach(({ corners, brightness }) => {
      ctx.fillStyle = colors.alpha('lane-0', 0.18 + brightness * 0.62)
      ctx.strokeStyle = colors.alpha('line', 0.6)
      ctx.lineWidth = 0.6
      ctx.beginPath()
      corners.forEach((corner, index) => {
        if (index === 0) ctx.moveTo(corner.screen.x, corner.screen.y)
        else ctx.lineTo(corner.screen.x, corner.screen.y)
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) drawLine3d(ctx, VP, rect, patch[i][j], patch[i][j + 1], { color: colors.muted, width: 1.25 })
    }
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 3; i++) drawLine3d(ctx, VP, rect, patch[i][j], patch[i + 1][j], { color: colors.muted, width: 1.25 })
    }
    let previousU = bezierPatch(patch, 0, v).point
    let previousV = bezierPatch(patch, u, 0).point
    for (let i = 1; i <= 80; i++) {
      const parameter = i / 80
      const nextU = bezierPatch(patch, parameter, v).point
      const nextV = bezierPatch(patch, u, parameter).point
      drawLine3d(ctx, VP, rect, previousU, nextU, { color: laneColor(colors, 2), width: 2.5 })
      drawLine3d(ctx, VP, rect, previousV, nextV, { color: laneColor(colors, 3), width: 2.5 })
      previousU = nextU
      previousV = nextV
    }
    drawArrow3d(ctx, VP, rect, current.point, addScaled(current.point, current.du, 0.28), { color: laneColor(colors, 2), width: 2 })
    drawArrow3d(ctx, VP, rect, current.point, addScaled(current.point, current.dv, 0.28), { color: laneColor(colors, 3), width: 2 })
    drawArrow3d(ctx, VP, rect, current.point, addScaled(current.point, current.normal, 0.8), { color: laneColor(colors, 4), width: 2.25 })

    patch.flat().forEach((point, index) => {
      const projected = projectPoint(VP, point, rect)
      markerCircle(ctx, projected.x, projected.y, POINT_R, {
        fill: colors.accent,
        stroke: colors.ink,
        lineWidth: index === selected ? 3.5 : 1.25,
      })
    })
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  const projectedControls = (width, height) => {
    const scene = sceneOf(width, height)
    return patch.flat().map((point, index) => ({ index, ...projectPoint(scene.VP, point, scene.rect) }))
  }
  const hitControl = (position) => {
    const { width, height } = sizeRef.current
    let hit = -1
    let distance = POINT_R + 7
    projectedControls(width, height).forEach((point) => {
      const candidate = Math.hypot(position.x - point.x, position.y - point.y)
      if (candidate <= distance) {
        hit = point.index
        distance = candidate
      }
    })
    return hit
  }
  usePointerDrag(canvasRef, {
    canGrab: () => true,
    onDown: (position) => {
      const index = hitControl(position)
      if (index >= 0) {
        setSelected(index)
        dragging.current = { type: 'height', index, startY: position.y, startHeight: patch[Math.floor(index / 4)][index % 4][1] }
      } else {
        dragging.current = { type: 'orbit', startX: position.x, startY: position.y, startYaw: yaw, startPitch: pitch }
      }
    },
    onMove: (position) => {
      if (dragging.current?.type === 'height') {
        const { index, startY, startHeight } = dragging.current
        const row = Math.floor(index / 4)
        const column = index % 4
        const heightValue = clamp(startHeight - (position.y - startY) * 0.015, -1.8, 1.8)
        setPatch((currentPatch) => currentPatch.map((line, i) => line.map((point, j) => i === row && j === column ? [point[0], heightValue, point[2]] : point)))
      }
      if (dragging.current?.type === 'orbit') {
        setYaw(dragging.current.startYaw + (position.x - dragging.current.startX) * 0.008)
        setPitch(clamp(dragging.current.startPitch - (position.y - dragging.current.startY) * 0.008, -1.1, 1.1))
      }
    },
    onUp: () => { dragging.current = null },
  })

  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const direction = event.key === 'PageUp' ? 1 : -1
      setSelected((selected + direction + 16) % 16)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const row = Math.floor(selected / 4)
    const column = selected % 4
    const delta = (step.dx + step.dy) * 0.08
    setPatch((currentPatch) => currentPatch.map((line, i) => line.map((point, j) => i === row && j === column
      ? [point[0], clamp(point[1] + delta, -1.8, 1.8), point[2]]
      : point)))
  }
  const reset = () => {
    setPatch(initialPatch())
    setU(0.52)
    setV(0.46)
    setSelected(5)
    setYaw(0.68)
    setPitch(0.42)
  }
  const selectedPoint = patch[Math.floor(selected / 4)][selected % 4]

  return (
    <SimShell
      label="双 3 次ベジエ曲面"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="4 掛ける 4 個の制御点で作るベジエ曲面。制御点を上下にドラッグすると高さが変わり、空いている場所をドラッグすると視点が回る。矢印キーで選択点の高さを変え、PageUp と PageDown で点を選べる" />}
      legend={<SimLegend items={[
        { key: 'surface', label: 'ベジエ曲面', swatch: 'var(--lane-0)' },
        { key: 'u', symbol: 'S_u', label: 'u 方向の接線', swatch: 'var(--lane-2)' },
        { key: 'v', symbol: 'S_v', label: 'v 方向の接線', swatch: 'var(--lane-3)' },
        { key: 'normal', symbol: 'n', label: '法線', swatch: 'var(--lane-4)' },
        { key: 'height', label: `P${Math.floor(selected / 4)}${selected % 4} の高さ`, value: fmt(selectedPoint[1], 2), minChars: 7 },
      ]} />}
      controls={
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="u" label="曲面上の u" value={u} min={0} max={1} step={0.01} onChange={setU} format={(value) => value.toFixed(2)} />
          <ParamSlider symbol="v" label="曲面上の v" value={v} min={0} max={1} step={0.01} onChange={setV} format={(value) => value.toFixed(2)} />
        </>
      }
    />
  )
}
