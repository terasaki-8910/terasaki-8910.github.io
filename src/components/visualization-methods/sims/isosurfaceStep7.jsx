import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView } from '../../visualization/axes'
import { arrowStep, clamp, drawText, markerCircle } from '../../visualization/sims/rigidKit'
import { bilinear, marchingSquares, saddlePoint, saddleValue, squareCase, squareSegments } from '../../../utils/vis/isosurface'
import { clipToFrame, rampColor } from './isosurfaceKit'

const INITIAL = [0.83, -1, -0.66, 0.82]
const FINE = 65

export default function IsosurfaceStep7() {
  const [values, setValues] = useState(INITIAL)
  const [rule, setRule] = useState('asymptotic')
  const selectedRef = useRef(0)
  const cellCase = squareCase(values[0], values[1], values[3], values[2], 0)
  const saddle = saddlePoint(values[0], values[1], values[2], values[3])
  const fs = saddleValue(values[0], values[1], values[2], values[3])
  const centerValue = bilinear(values[0], values[1], values[2], values[3], 0.5, 0.5)
  const disagree = (fs >= 0) !== (centerValue >= 0)

  const geometry = (width, height) => {
    const view = makeView({ width, height, xRange: [-0.28, 1.28], yRange: [-0.3, 1.32], margin: { left: 38, right: 24, top: 18, bottom: 32 }, equal: true })
    return { view, barScale: Math.min(42, view.scaleY * 0.23) }
  }
  const fineContour = () => {
    const samples = new Float64Array(FINE * FINE)
    for (let j = 0; j < FINE; j++) for (let i = 0; i < FINE; i++) samples[i + FINE * j] = bilinear(values[0], values[1], values[2], values[3], i / (FINE - 1), j / (FINE - 1))
    return marchingSquares(samples, FINE, FINE, 0).segments
  }
  const draw = ({ ctx, width, height, colors }) => {
    const { view, barScale } = geometry(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    clipToFrame(ctx, view, () => {
      const resolution = 50
      for (let j = 0; j < resolution; j++) for (let i = 0; i < resolution; i++) {
        const u = (i + 0.5) / resolution
        const v = (j + 0.5) / resolution
        ctx.fillStyle = rampColor(colors, bilinear(values[0], values[1], values[2], values[3], u, v), 1)
        ctx.fillRect(view.sx(i / resolution), view.sy((j + 1) / resolution), view.sx((i + 1) / resolution) - view.sx(i / resolution) + 0.5, view.sy(j / resolution) - view.sy((j + 1) / resolution) + 0.5)
      }
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1.5
      ctx.strokeRect(view.sx(0), view.sy(1), view.sx(1) - view.sx(0), view.sy(0) - view.sy(1))

      const asymptotic = squareSegments(values[0], values[1], values[3], values[2], 0, { ambiguity: 'asymptotic' })
      const central = squareSegments(values[0], values[1], values[3], values[2], 0, { ambiguity: 'center' })
      const chosen = rule === 'asymptotic' ? asymptotic : central
      const rejected = rule === 'asymptotic' ? central : asymptotic
      rejected.forEach(([a, b]) => {
        ctx.strokeStyle = colors.muted
        ctx.lineWidth = 2
        ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(view.sx(a[0]), view.sy(a[1])); ctx.lineTo(view.sx(b[0]), view.sy(b[1])); ctx.stroke(); ctx.setLineDash([])
      })
      chosen.forEach(([a, b]) => {
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 3.2
        ctx.beginPath(); ctx.moveTo(view.sx(a[0]), view.sy(a[1])); ctx.lineTo(view.sx(b[0]), view.sy(b[1])); ctx.stroke()
      })
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.25
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      fineContour().forEach(([a, b]) => {
        ctx.moveTo(view.sx(a[0] / (FINE - 1)), view.sy(a[1] / (FINE - 1)))
        ctx.lineTo(view.sx(b[0] / (FINE - 1)), view.sy(b[1] / (FINE - 1)))
      })
      ctx.stroke(); ctx.setLineDash([])

      if (saddle && saddle.u >= 0 && saddle.u <= 1 && saddle.v >= 0 && saddle.v <= 1) {
        markerCircle(ctx, view.sx(saddle.u), view.sy(saddle.v), 5, { fill: colors.accent, stroke: colors.ink, lineWidth: 1.2 })
        drawText(ctx, `(${saddle.u.toFixed(2)}, ${saddle.v.toFixed(2)})`, view.sx(saddle.u) + 8, view.sy(saddle.v) - 8, { color: colors.ink, size: 10 })
      }
      const positions = [[0, 0], [1, 0], [0, 1], [1, 1]]
      const labels = ['f00', 'f10', 'f01', 'f11']
      positions.forEach(([u, v], index) => {
        const base = [view.sx(u), view.sy(v)]
        const top = [base[0], base[1] - values[index] * barScale]
        ctx.strokeStyle = colors.ink
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...top); ctx.stroke()
        markerCircle(ctx, top[0], top[1], 7, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current === index ? 3 : 1.5 })
        drawText(ctx, `${labels[index]} ${values[index].toFixed(2)}`, top[0] + (u ? -9 : 9), top[1] + (v ? -9 : 13), { color: colors.ink, size: 10, align: u ? 'right' : 'left' })
      })
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [values, rule, redraw])
  const hit = (point) => {
    const { view, barScale } = geometry(sizeRef.current.width, sizeRef.current.height)
    const positions = [[0, 0], [1, 0], [0, 1], [1, 1]]
    for (let index = 0; index < 4; index++) {
      const [u, v] = positions[index]
      if (Math.hypot(point.x - view.sx(u), point.y - (view.sy(v) - values[index] * barScale)) <= 19) return index
    }
    return -1
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => hit(point) >= 0,
    onDown: (point) => { const index = hit(point); if (index < 0) return false; selectedRef.current = index; redraw(); return true },
    onMove: ({ dy }) => {
      const { barScale } = geometry(sizeRef.current.width, sizeRef.current.height)
      setValues((current) => current.map((value, index) => index === selectedRef.current ? clamp(value - dy / barScale, -1, 1) : value))
    },
    onUp: () => {},
  })
  const onKeyDown = (event) => {
    if (/^[1-4]$/.test(event.key)) { selectedRef.current = Number(event.key) - 1; redraw(); return }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setValues((current) => current.map((value, index) => index === selectedRef.current ? clamp(value + step.dy * 0.05, -1, 1) : value))
  }
  return (
    <SimShell
      label="双線形場のあいまいなマス"
      switcher={<ModeSwitch label="判定" value={rule} options={[{ value: 'asymptotic', label: '漸近線判定' }, { value: 'center', label: '中心の値' }]} onChange={setRule} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="四隅の縦棒を上下にドラッグできます。1 から 4 キーで棒を選び、上下キーでも値を変えられます。点線の双曲線と、選んだ接続を比べられます。" />}
      legend={<SimLegend items={[
        { key: 'true', label: '双線形関数の真の等値線', value: '細い点線', swatch: 'var(--color-ink)' },
        { key: 'chosen', label: '選んだ接続', value: '実線', swatch: 'var(--color-ink)' },
        { key: 'rejected', label: '選ばなかった接続', value: '破線', swatch: 'var(--color-muted)' },
        { key: 'saddle', symbol: 'f_s', label: '鞍点の値', value: fs.toFixed(3) },
        { key: 'center', label: '中心の値', value: centerValue.toFixed(3) },
        { key: 'disagree', label: '2 つの判定', value: disagree ? '不一致' : '一致', swatch: disagree ? 'rgb(var(--color-accent))' : undefined },
        { key: 'case', label: 'case', value: String(cellCase) },
      ]} />}
      controls={<SimToolbar><ResetButton onClick={() => { setValues(INITIAL); setRule('asymptotic'); selectedRef.current = 0 }} /></SimToolbar>}
    />
  )
}
