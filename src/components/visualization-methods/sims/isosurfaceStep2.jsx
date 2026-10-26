import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawArrow, drawAxes } from '../../visualization/axes'
import { arrowStep, clamp, drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { curvature2D, gradient2D } from '../../../utils/vis/isosurface'
import { clipToFrame, drawFieldImage, makeIsoView } from './isosurfaceKit'

const CENTER = [0, 0]
const X_RANGE = [-2, 2]
const Y_RANGE = [-1.5, 1.5]

export default function IsosurfaceStep2() {
  const [radius, setRadius] = useState(0.9)
  const [probe, setProbe] = useState([0.75, 0.65])
  const [showNormals, setShowNormals] = useState(false)
  const draggingRef = useRef(false)
  const field = (x, y) => (x - CENTER[0]) ** 2 + (y - CENTER[1]) ** 2 - radius ** 2
  const gradient = gradient2D(field, probe[0], probe[1], 0.001)
  const length = Math.hypot(...gradient) || 1
  const normal = gradient.map((value) => value / length)
  const curvature = curvature2D(field, CENTER[0] + radius, CENTER[1], 0.002)

  const draw = ({ ctx, width, height, colors }) => {
    const view = makeIsoView(width, height, undefined, X_RANGE, Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    clipToFrame(ctx, view, () => {
      drawFieldImage(ctx, view, colors, field, { scale: 2, invert: true, xRange: X_RANGE, yRange: Y_RANGE })
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(view.sx(CENTER[0]), view.sy(CENTER[1]), radius * view.scaleX, 0, Math.PI * 2)
      ctx.stroke()
      if (showNormals) {
        for (let y = -1.25; y <= 1.25; y += 0.5) for (let x = -1.75; x <= 1.75; x += 0.5) {
          const g = gradient2D(field, x, y, 0.002)
          const d = Math.hypot(...g)
          if (d < 1e-6) continue
          drawArrow(ctx, view, x, y, x + 0.18 * g[0] / d, y + 0.18 * g[1] / d, { color: colors.muted, width: 1, head: 4 })
        }
      }
      const vectorScale = 0.22
      drawArrow(ctx, view, probe[0], probe[1], probe[0] + vectorScale * gradient[0], probe[1] + vectorScale * gradient[1], { color: colors.ink, width: 2, head: 7 })
      drawArrow(ctx, view, probe[0], probe[1], probe[0] + 0.52 * normal[0], probe[1] + 0.52 * normal[1], { color: colors.alpha('lane-0', 1), width: 2.5, head: 8 })
      markerCircle(ctx, view.sx(probe[0]), view.sy(probe[1]), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: draggingRef.current ? 3 : 1.5 })
      drawText(ctx, `f = ${field(...probe).toFixed(3)}`, view.sx(probe[0]) + 12, view.sy(probe[1]) - 12, { color: colors.ink, size: 12 })
      drawText(ctx, `κ = ${curvature.toFixed(3)}  /  1/r = ${(1 / radius).toFixed(3)}`, view.sx(CENTER[0] + radius), view.sy(CENTER[1]) - 14, { color: colors.ink, size: 12, align: 'center' })
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [radius, probe, showNormals, redraw])
  const viewFor = () => makeIsoView(sizeRef.current.width, sizeRef.current.height, undefined, X_RANGE, Y_RANGE)
  const hitProbe = (point) => Math.hypot(point.x - viewFor().sx(probe[0]), point.y - viewFor().sy(probe[1])) <= 19
  usePointerDrag(canvasRef, {
    canGrab: hitProbe,
    onDown: (point) => { if (!hitProbe(point)) return false; draggingRef.current = true; redraw(); return true },
    onMove: ({ x, y }) => { const view = viewFor(); setProbe([clamp(view.wx(x), X_RANGE[0], X_RANGE[1]), clamp(view.wy(y), Y_RANGE[0], Y_RANGE[1])]) },
    onUp: () => { draggingRef.current = false; redraw() },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setProbe(([x, y]) => [clamp(x + step.dx * 0.05, X_RANGE[0], X_RANGE[1]), clamp(y + step.dy * 0.05, Y_RANGE[0], Y_RANGE[1])])
  }
  return (
    <SimShell
      label="陰関数の値、法線、曲率"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="円の陰関数。点をドラッグまたは矢印キーで動かすと、値、勾配、単位法線が変わります。" />}
      legend={<SimLegend items={[
        { key: 'field', label: '−f の色（内側を濃く表示）', value: '外 → 内', swatch: 'linear-gradient(90deg, var(--surface), var(--lane-1))' },
        { key: 'gradient', symbol: '\\nabla f', label: '勾配', value: `(${gradient[0].toFixed(2)}, ${gradient[1].toFixed(2)})`, swatch: 'var(--ink)' },
        { key: 'normal', symbol: '\\hat{n}', label: '単位法線', value: `(${normal[0].toFixed(2)}, ${normal[1].toFixed(2)})`, swatch: 'var(--lane-0)' },
      ]} />}
      controls={<>
        <SimToolbar>
          <ResetButton onClick={() => { setRadius(0.9); setProbe([0.75, 0.65]); setShowNormals(false) }} />
          <ToggleButton pressed={showNormals} onChange={setShowNormals}>法線を並べる</ToggleButton>
        </SimToolbar>
        <ParamSlider symbol="r" label="円の半径" value={radius} min={0.4} max={1.3} step={0.01} onChange={setRadius} format={(v) => v.toFixed(2)} />
      </>}
    />
  )
}
