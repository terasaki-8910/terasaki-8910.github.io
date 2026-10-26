import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView } from '../../visualization/axes'
import { arrowStep, clamp, drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { marchingSquares, squareCase, squareSegments } from '../../../utils/vis/isosurface'
import { clipToFrame, rampColor } from './isosurfaceKit'

const N = 10
const INITIAL_CORNERS = [true, false, true, false]

export default function IsosurfaceStep6() {
  const [corners, setCorners] = useState(INITIAL_CORNERS)
  const [center, setCenter] = useState([0.56, 0.52])
  const selectedRef = useRef({ kind: 'corner', index: 0 })
  const values = corners.map((inside) => inside ? 1 : -1)
  const cellCase = squareCase(values[0], values[1], values[2], values[3], 0)
  const cellSegments = squareSegments(values[0], values[1], values[2], values[3], 0)

  const layouts = (width, height) => {
    const stacked = width < 520
    if (stacked) {
      const split = Math.round(height * 0.42)
      return {
        cell: makeView({ width, height, xRange: [-0.15, 1.15], yRange: [-0.18, 1.18], margin: { left: 44, right: 24, top: 16, bottom: height - split + 18 }, equal: true }),
        field: makeView({ width, height, xRange: [0, 1], yRange: [0, 1], margin: { left: 44, right: 24, top: split + 22, bottom: 28 }, equal: true }),
      }
    }
    const split = Math.round(width * 0.38)
    return {
      cell: makeView({ width, height, xRange: [-0.15, 1.15], yRange: [-0.18, 1.18], margin: { left: 38, right: width - split + 20, top: 28, bottom: 34 }, equal: true }),
      field: makeView({ width, height, xRange: [0, 1], yRange: [0, 1], margin: { left: split + 30, right: 22, top: 22, bottom: 34 }, equal: true }),
    }
  }
  const fieldData = () => {
    const samples = new Float64Array(N * N)
    const r = 0.27
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i / (N - 1)
      const y = j / (N - 1)
      samples[i + N * j] = r * r - ((x - center[0]) ** 2 + (y - center[1]) ** 2)
    }
    return { samples, contour: marchingSquares(samples, N, N, 0) }
  }
  const draw = ({ ctx, width, height, colors }) => {
    const { cell, field } = layouts(width, height)
    const data = fieldData()
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    clipToFrame(ctx, cell, () => {
      ctx.fillStyle = colors.paper
      ctx.fillRect(cell.sx(0), cell.sy(1), cell.sx(1) - cell.sx(0), cell.sy(0) - cell.sy(1))
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1.5
      ctx.strokeRect(cell.sx(0), cell.sy(1), cell.sx(1) - cell.sx(0), cell.sy(0) - cell.sy(1))
      cellSegments.forEach(([a, b]) => {
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(cell.sx(a[0]), cell.sy(a[1])); ctx.lineTo(cell.sx(b[0]), cell.sy(b[1])); ctx.stroke()
      })
      const positions = [[0, 0], [1, 0], [1, 1], [0, 1]]
      positions.forEach(([x, y], index) => {
        markerCircle(ctx, cell.sx(x), cell.sy(y), 8, { fill: corners[index] ? colors.ink : colors.surface, stroke: colors.ink, lineWidth: selectedRef.current.kind === 'corner' && selectedRef.current.index === index ? 3 : 1.5 })
        drawText(ctx, String(index + 1), cell.sx(x) + (x ? -12 : 12), cell.sy(y) + (y ? 12 : -12), { color: colors.ink, size: 11, align: x ? 'right' : 'left' })
      })
      drawText(ctx, `case ${cellCase}`, cell.sx(0.5), cell.sy(0.5), { color: colors.muted, size: 16, align: 'center', baseline: 'middle' })
    })

    clipToFrame(ctx, field, () => {
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const f00 = data.samples[i + N * j]
        const f10 = data.samples[i + 1 + N * j]
        const f01 = data.samples[i + N * (j + 1)]
        const f11 = data.samples[i + 1 + N * (j + 1)]
        ctx.fillStyle = rampColor(colors, (f00 + f10 + f01 + f11) / 4, 0.12)
        ctx.fillRect(field.sx(i / (N - 1)), field.sy((j + 1) / (N - 1)), field.sx((i + 1) / (N - 1)) - field.sx(i / (N - 1)) + 0.5, field.sy(j / (N - 1)) - field.sy((j + 1) / (N - 1)) + 0.5)
        drawText(ctx, String(squareCase(f00, f10, f11, f01, 0)), field.sx((i + 0.5) / (N - 1)), field.sy((j + 0.5) / (N - 1)), { color: colors.muted, size: 8, align: 'center', baseline: 'middle' })
      }
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 0.8
      for (let k = 0; k < N; k++) {
        const q = k / (N - 1)
        ctx.beginPath(); ctx.moveTo(field.sx(q), field.sy(0)); ctx.lineTo(field.sx(q), field.sy(1)); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(field.sx(0), field.sy(q)); ctx.lineTo(field.sx(1), field.sy(q)); ctx.stroke()
      }
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.contour.segments.forEach(([a, b]) => {
        ctx.moveTo(field.sx(a[0] / (N - 1)), field.sy(a[1] / (N - 1)))
        ctx.lineTo(field.sx(b[0] / (N - 1)), field.sy(b[1] / (N - 1)))
      })
      ctx.stroke()
      markerCircle(ctx, field.sx(center[0]), field.sy(center[1]), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current.kind === 'circle' ? 3 : 1.5 })
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [corners, center, redraw])
  const currentLayouts = () => layouts(sizeRef.current.width, sizeRef.current.height)
  const hit = (point) => {
    const { cell, field } = currentLayouts()
    const positions = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (let index = 0; index < 4; index++) if (Math.hypot(point.x - cell.sx(positions[index][0]), point.y - cell.sy(positions[index][1])) <= 18) return { kind: 'corner', index }
    if (Math.hypot(point.x - field.sx(center[0]), point.y - field.sy(center[1])) <= 20) return { kind: 'circle', index: -1 }
    return null
  }
  const toggleCorner = (index) => setCorners((current) => current.map((inside, i) => i === index ? !inside : inside))
  usePointerDrag(canvasRef, {
    canGrab: (point) => Boolean(hit(point)),
    onDown: (point) => { const target = hit(point); if (!target) return false; selectedRef.current = target; if (target.kind === 'corner') toggleCorner(target.index); redraw(); return true },
    onMove: ({ x, y }) => {
      if (selectedRef.current.kind !== 'circle') return
      const { field } = currentLayouts()
      setCenter([clamp(field.wx(x), 0.28, 0.72), clamp(field.wy(y), 0.28, 0.72)])
    },
    onUp: () => {},
  })
  const onKeyDown = (event) => {
    if (/^[1-4]$/.test(event.key)) { event.preventDefault(); const index = Number(event.key) - 1; selectedRef.current = { kind: 'corner', index }; toggleCorner(index); return }
    if ((event.key === ' ' || event.key === 'Enter') && selectedRef.current.kind === 'corner') { event.preventDefault(); toggleCorner(selectedRef.current.index); return }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selectedRef.current.kind === 'corner') {
      const positions = [[0, 0], [1, 0], [1, 1], [0, 1]]
      const [x, y] = positions[selectedRef.current.index]
      const nextX = clamp(x + step.dx, 0, 1)
      const nextY = clamp(y + step.dy, 0, 1)
      selectedRef.current = { kind: 'corner', index: positions.findIndex(([px, py]) => px === nextX && py === nextY) }
    } else setCenter(([x, y]) => [clamp(x + step.dx * 0.02, 0.28, 0.72), clamp(y + step.dy * 0.02, 0.28, 0.72)])
    redraw()
  }
  return (
    <SimShell
      label="マーチングスクエアの 16 通り"
      height={{ phone: [330, 410], pc: [280, 360] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="左の四隅をクリック、または 1 から 4 キーで切り替えられます。右の円の中心をドラッグでき、矢印キーでも選択中の対象を操作できます。" />}
      legend={<SimLegend items={[
        { key: 'outside', label: '外側の角', swatch: 'var(--color-surface)' },
        { key: 'inside', label: '内側の角', swatch: 'var(--color-ink)' },
        { key: 'case', label: '左の case', value: String(cellCase), minChars: 3 },
        { key: 'segments', label: '右の線分', value: String(fieldData().contour.segments.length), minChars: 4 },
      ]} />}
      controls={<SimToolbar><ResetButton onClick={() => { setCorners(INITIAL_CORNERS); setCenter([0.56, 0.52]); selectedRef.current = { kind: 'corner', index: 0 } }} /></SimToolbar>}
    />
  )
}
