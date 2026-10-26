import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, clamp, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { weightedLeastSquares } from '../../../utils/vis/isosurface'
import { clipToFrame, makeIsoView } from './isosurfaceKit'

function makePoints(seed) {
  let state = seed >>> 0
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
  const xs = []
  const gs = []
  for (let i = 0; i < 30; i++) {
    const x = 0.1 + 3.8 * i / 29 + (random() - 0.5) * 0.055
    const curve = 1.45 + 0.62 * Math.sin(1.65 * x - 0.65) + 0.12 * (x - 2) ** 2
    xs.push(x)
    gs.push(curve + (random() - 0.5) * 0.42)
  }
  return { xs, gs }
}

export default function IsosurfaceStep4() {
  const [seed, setSeed] = useState(8910)
  const [query, setQuery] = useState(2)
  const [bandwidth, setBandwidth] = useState(0.55)
  const draggingRef = useRef(false)
  const points = useMemo(() => makePoints(seed), [seed])
  const fit = weightedLeastSquares(points.xs, points.gs, query, bandwidth)

  const draw = ({ ctx, width, height, colors }) => {
    const view = makeIsoView(width, height, undefined, [0, 4], [0.25, 2.85])
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    clipToFrame(ctx, view, () => {
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      let started = false
      for (let i = 0; i <= 180; i++) {
        const x = 4 * i / 180
        const local = weightedLeastSquares(points.xs, points.gs, x, bandwidth)
        if (!local) continue
        if (!started) { ctx.moveTo(view.sx(x), view.sy(local.value)); started = true } else ctx.lineTo(view.sx(x), view.sy(local.value))
      }
      ctx.stroke()
      if (fit) {
        ctx.strokeStyle = laneColor(colors, 1)
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let i = 0; i <= 100; i++) {
          const x = clamp(query - 1.25 * bandwidth + 2.5 * bandwidth * i / 100, 0, 4)
          const d = x - query
          const y = fit.c[0] + fit.c[1] * d + fit.c[2] * d * d
          if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
          else ctx.lineTo(view.sx(x), view.sy(y))
        }
        ctx.stroke()
      }
      points.xs.forEach((x, index) => {
        const weight = fit?.weights[index] ?? 0
        markerCircle(ctx, view.sx(x), view.sy(points.gs[index]), 2.5 + 4 * weight, {
          fill: colors.alpha('lane-0', 0.18 + 0.82 * weight),
          stroke: colors.alpha('ink', 0.3 + 0.7 * weight),
          lineWidth: 0.8,
        })
      })
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.4
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(view.sx(query), view.frame.top); ctx.lineTo(view.sx(query), view.frame.bottom); ctx.stroke(); ctx.setLineDash([])
      if (fit) markerCircle(ctx, view.sx(query), view.sy(fit.value), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: draggingRef.current ? 3 : 1.5 })
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [points, query, bandwidth, redraw])
  const viewFor = () => makeIsoView(sizeRef.current.width, sizeRef.current.height, undefined, [0, 4], [0.25, 2.85])
  const hitQuery = (point) => Math.abs(point.x - viewFor().sx(query)) <= 18 && point.y >= viewFor().frame.top && point.y <= viewFor().frame.bottom
  usePointerDrag(canvasRef, {
    canGrab: hitQuery,
    onDown: (point) => { if (!hitQuery(point)) return false; draggingRef.current = true; redraw(); return true },
    onMove: ({ x }) => setQuery(clamp(viewFor().wx(x), 0, 4)),
    onUp: () => { draggingRef.current = false; redraw() },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setQuery((value) => clamp(value + step.dx * 0.05, 0, 4))
  }
  const coefficients = fit?.c ?? [NaN, NaN, NaN]
  return (
    <SimShell
      label="移動最小二乗による局所近似"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="散らばった点と移動最小二乗曲線。縦の照会位置をドラッグまたは左右キーで動かせます。" />}
      legend={<SimLegend items={[
        { key: 'samples', label: '測定点（重みで大きさ・濃さが変化）', swatch: 'var(--lane-0)' },
        { key: 'local', label: '局所 2 次式', swatch: 'var(--lane-1)' },
        { key: 'curve', label: 'MLS 曲線', swatch: 'var(--color-ink)' },
        { key: 'coefficients', symbol: 'c', label: '係数', value: `(${coefficients.map((value) => Number.isFinite(value) ? value.toFixed(3) : '—').join(', ')})`, minChars: 24 },
      ]} />}
      controls={<>
        <SimToolbar>
          <ResetButton onClick={() => { setSeed(8910); setQuery(2); setBandwidth(0.55) }} />
          <ToggleButton pressed={false} onChange={() => setSeed((value) => value + 1)}>点を作り直す</ToggleButton>
        </SimToolbar>
        <ParamSlider symbol="h" label="重みの幅" value={bandwidth} min={0.1} max={2} step={0.01} onChange={setBandwidth} format={(v) => v.toFixed(2)} />
      </>}
    />
  )
}
