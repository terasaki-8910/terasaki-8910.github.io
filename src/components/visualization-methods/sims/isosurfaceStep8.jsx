import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { cubeCase, cubeCaseClasses, marchingCubes, marchingCubesCell } from '../../../utils/vis/isosurface'
import { cameraViewProjection, projectVertex, renderScene } from '../../../utils/vis/render'
import { flatEnvironment, tokenRgb } from './shadingKit'
import { blitPixels } from './pixelKit'

const INITIAL = [1, -1, -1, 1, -1, 1, 1, -1]
const CLASS_INFO = cubeCaseClasses({ complement: true })
const CORNERS = Array.from({ length: 8 }, (_, k) => [k & 1, (k >> 1) & 1, (k >> 2) & 1])
const EDGES = []
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit])

function cameraFor(mode, yaw, pitch) {
  const target = mode === 'cube' ? [0.5, 0.5, 0.5] : [0, 0, 0]
  const distance = mode === 'cube' ? 3.1 : 3.4
  return {
    eye: [
      target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
      target[1] + distance * Math.sin(pitch),
      target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
    ],
    target,
    up: [0, 1, 0],
    fov: Math.PI / 4,
    near: 0.1,
    far: 20,
  }
}

function sphereMesh(n) {
  const values = new Float64Array(n ** 3)
  const r = 0.72
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -1 + 2 * i / (n - 1)
    const y = -1 + 2 * j / (n - 1)
    const z = -1 + 2 * k / (n - 1)
    values[i + n * (j + n * k)] = r * r - (x * x + y * y + z * z)
  }
  const mesh = marchingCubes(values, n, n, n, 0)
  return { ...mesh, positions: mesh.positions.map(([x, y, z]) => [-1 + 2 * x / (n - 1), -1 + 2 * y / (n - 1), -1 + 2 * z / (n - 1)]) }
}

export default function IsosurfaceStep8() {
  const [mode, setMode] = useState('cube')
  const [values, setValues] = useState(INITIAL)
  const [grid, setGrid] = useState(9)
  const cameraRef = useRef({ yaw: -0.72, pitch: 0.38 })
  const selectedRef = useRef(-1)
  const rotatingRef = useRef(false)
  const legendRef = useRef(null)
  const currentCase = cubeCase(values, 0)
  const cubeCell = marchingCubesCell(values, 0)

  const sceneMesh = () => mode === 'cube' ? marchingCubes(Float64Array.from(values), 2, 2, 2, 0) : sphereMesh(grid)
  const draw = ({ ctx, width, height, colors }) => {
    const camera = cameraFor(mode, cameraRef.current.yaw, cameraRef.current.pitch)
    const mesh = sceneMesh()
    const pixels = new Uint8ClampedArray(width * height * 4)
    renderScene({
      meshes: [{
        positions: mesh.positions,
        normals: mesh.normals,
        faces: mesh.triangles,
        material: { color: tokenRgb(colors, 'lane-1'), kd: 0.8, ks: 0.28, shininess: 24, kind: 'paint' },
      }],
      light: { position: [4, 5, 6], intensity: 1 },
      ambient: 0.14,
      environment: flatEnvironment(colors),
    }, camera, { width, height, shading: 'phong', model: 'blinn-phong', shadows: false, cull: false }, pixels)
    blitPixels(ctx, pixels, width, height)
    const matrix = cameraViewProjection(camera, width / height)
    if (mode === 'cube') {
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      EDGES.forEach(([a, b]) => {
        const p = projectVertex(matrix, CORNERS[a], width, height)
        const q = projectVertex(matrix, CORNERS[b], width, height)
        if (!p || !q) return
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
      })
      for (const point of cubeCell.points.values()) {
        const p = projectVertex(matrix, point, width, height)
        if (p) markerCircle(ctx, p[0], p[1], 4, { fill: colors.accent, stroke: colors.ink, lineWidth: 1 })
      }
      CORNERS.forEach((corner, index) => {
        const p = projectVertex(matrix, corner, width, height)
        if (!p) return
        markerCircle(ctx, p[0], p[1], 8, { fill: values[index] >= 0 ? colors.ink : colors.surface, stroke: colors.ink, lineWidth: selectedRef.current === index ? 3 : 1.5 })
        drawText(ctx, String(index), p[0] + (corner[0] ? -11 : 11), p[1] - 10, { color: colors.ink, size: 10, align: corner[0] ? 'right' : 'left' })
      })
      legendRef.current?.update({ triangles: String(mesh.triangles.length) })
    } else legendRef.current?.update({ triangles: String(mesh.triangles.length) })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [mode, values, grid, redraw])
  const hitCorner = (point) => {
    if (mode !== 'cube') return -1
    const { width, height } = sizeRef.current
    const camera = cameraFor(mode, cameraRef.current.yaw, cameraRef.current.pitch)
    const matrix = cameraViewProjection(camera, width / height)
    let hit = -1
    let distance = 19
    CORNERS.forEach((corner, index) => {
      const p = projectVertex(matrix, corner, width, height)
      if (!p) return
      const d = Math.hypot(point.x - p[0], point.y - p[1])
      if (d <= distance) { distance = d; hit = index }
    })
    return hit
  }
  usePointerDrag(canvasRef, {
    canGrab: () => true,
    onDown: (point) => {
      const hit = hitCorner(point)
      selectedRef.current = hit
      rotatingRef.current = hit < 0
      if (hit >= 0) setValues((current) => current.map((value, index) => index === hit ? -value : value))
      return true
    },
    onMove: ({ dx, dy }) => {
      if (!rotatingRef.current) return
      cameraRef.current.yaw -= dx * 0.008
      cameraRef.current.pitch = clamp(cameraRef.current.pitch - dy * 0.008, -1.15, 1.15)
      redraw()
    },
    onUp: () => { selectedRef.current = -1; rotatingRef.current = false; redraw() },
  })
  const onKeyDown = (event) => {
    if (mode === 'cube' && /^[1-8]$/.test(event.key)) {
      event.preventDefault()
      const index = Number(event.key) - 1
      setValues((current) => current.map((value, i) => i === index ? -value : value))
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    cameraRef.current.yaw += step.dx * 0.08
    cameraRef.current.pitch = clamp(cameraRef.current.pitch + step.dy * 0.08, -1.15, 1.15)
    redraw()
  }
  const reset = () => {
    setValues(INITIAL)
    setGrid(9)
    cameraRef.current = { yaw: -0.72, pitch: 0.38 }
    selectedRef.current = -1
    redraw()
  }
  return (
    <SimShell
      label="立方体から三角形を作る"
      switcher={<ModeSwitch label="表示" value={mode} options={[{ value: 'cube', label: '立方体 1 つ' }, { value: 'sphere', label: '球を取り出す' }]} onChange={setMode} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label={mode === 'cube' ? '立方体の角をクリックして内外を切り替えられます。空いた所のドラッグまたは矢印キーで回転できます。1 から 8 キーでも角を切り替えられます。' : '格子から取り出した球面です。ドラッグまたは矢印キーで回転できます。'} />}
      legend={<SimLegend ref={legendRef} items={[
        ...(mode === 'cube' ? [
          { key: 'case', label: 'case', value: String(currentCase), minChars: 4 },
          { key: 'class', label: '回転・内外でまとめた組', value: `15 組のうち ${CLASS_INFO.classOf[currentCase] + 1} 番`, minChars: 16 },
          { key: 'crossings', label: '辺の交点', swatch: 'rgb(var(--color-accent))' },
        ] : [{ key: 'grid', symbol: 'N\\times N\\times N', label: '格子', value: `${grid} × ${grid} × ${grid}` }]),
        { key: 'surface', label: mode === 'cube' ? '三角形' : '球面', swatch: 'var(--lane-1)' },
        { key: 'triangles', label: '三角形の数', value: '0', minChars: 6 },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
        {mode === 'sphere' && <ParamSlider symbol="N" label="格子数" value={grid} min={4} max={16} step={1} onChange={setGrid} />}
      </>}
    />
  )
}
