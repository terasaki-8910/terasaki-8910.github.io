import { useEffect, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, fmt, laneColor, markerCircle } from '../../visualization/sims/rigidKit'
import { evenlySpacedStreamlines, seedsByMagnitude, seedsUniform, vortexField } from '../../../utils/vis/flow'
import { seededRandom } from '../../../utils/vis/ct'
import {
  DEMO_CENTERS, DEMO_X_RANGE, DEMO_Y_RANGE, boundsOf, clampInside, clipToFrame, demoVortices, drawHandle, fitView, nearestHandle, sampledField,
  lineExtent, pageStep, traceLine, unitField, useScheduledRedraw,
} from './flowKit'

const MODES = [
  { value: 'uniform', label: '均等' },
  { value: 'speed', label: '速さに合わせて' },
  { value: 'spacing', label: '間をあける' },
]
const COUNT_DEFAULT = 60
const SPACING_DEFAULT = 0.14
const LINE_STEP = 0.025 // 流線の 1 歩の長さ(曲線に沿った長さ)
const TINY = 0.1 // これより小さい輪(渦の芯の中)は、丸の下に隠れて黒い塊になるので描かない

export default function FlowStep3() {
  const [mode, setMode] = useState('uniform')
  const [count, setCount] = useState(COUNT_DEFAULT)
  const [spacing, setSpacing] = useState(SPACING_DEFAULT)
  const state = useRef(null)
  state.current = { mode, count, spacing }
  const centers = useRef(DEMO_CENTERS.map((c) => [...c]))
  const [selected, setSelected] = useState(0) // 矢印キーで動かす渦(最後につかんだ渦、PageUp・PageDown で変える)
  const selectedRef = useRef(0)
  const grabbed = useRef(-1)
  const legend = useRef(null)
  const select = (i) => {
    selectedRef.current = i
    setSelected(i)
  }

  const draw = ({ ctx, width, height, colors }) => {
    const s = state.current
    const view = fitView(width, height, DEMO_X_RANGE, DEMO_Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const bounds = boundsOf(view)
    const spanX = bounds[2] - bounds[0]
    const spanY = bounds[3] - bounds[1]
    const field = sampledField(vortexField(demoVortices(centers.current)), bounds, Math.min(300, Math.ceil(spanX / 0.02) + 1), Math.min(200, Math.ceil(spanY / 0.02) + 1))
    const unit = unitField(field)
    let lines
    let seeds
    if (s.mode === 'spacing') {
      lines = evenlySpacedStreamlines(field, bounds, s.spacing, { h: s.spacing / 4 }).filter((line) => lineExtent(line) >= TINY)
      // 出発点は、候補の格子点のうち線の上にあるもの(各線の最初の点)
      const candidates = new Set(seedsUniform(Math.max(1, Math.round(spanX / s.spacing)), Math.max(1, Math.round(spanY / s.spacing)), bounds).map((p) => `${p[0]},${p[1]}`))
      seeds = lines.map((line) => line.find((p) => candidates.has(`${p[0]},${p[1]}`))).filter(Boolean)
    } else {
      const aspect = spanX / spanY
      const nx = Math.max(2, Math.round(Math.sqrt(s.count * aspect)))
      const ny = Math.max(2, Math.round(s.count / nx))
      seeds = s.mode === 'uniform' ? seedsUniform(nx, ny, bounds) : seedsByMagnitude(field, s.count, bounds, seededRandom(11))
      lines = seeds.map((seed) => traceLine(unit, seed, { h: LINE_STEP, maxSteps: 100, bounds })).filter((line) => lineExtent(line) >= TINY)
    }
    clipToFrame(ctx, view, () => {
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = width < 520 ? 1.1 : 1.4
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (const line of lines) {
        line.forEach((p, i) => {
          if (i === 0) ctx.moveTo(view.sx(p[0]), view.sy(p[1]))
          else ctx.lineTo(view.sx(p[0]), view.sy(p[1]))
        })
      }
      ctx.stroke()
      for (const p of seeds) markerCircle(ctx, view.sx(p[0]), view.sy(p[1]), 2.6, { fill: laneColor(colors, 1), stroke: colors.surface, lineWidth: 1 })
      centers.current.forEach((c, i) => drawHandle(ctx, view.sx(c[0]), view.sy(c[1]), colors, i === selectedRef.current))
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    const chosen = centers.current[selectedRef.current]
    legend.current?.update({ seeds: String(seeds.length), lines: `${lines.length} 本`, vortex: `${selectedRef.current + 1}（${fmt(chosen[0], 2)}, ${fmt(chosen[1], 2)}）` })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const schedule = useScheduledRedraw(redraw)
  useEffect(() => { redraw() }, [mode, count, spacing, selected, redraw])

  const viewNow = () => fitView(sizeRef.current.width, sizeRef.current.height, DEMO_X_RANGE, DEMO_Y_RANGE)
  const handles = () => {
    const view = viewNow()
    return centers.current.map((c) => ({ px: view.sx(c[0]), py: view.sy(c[1]) }))
  }
  const moveCenter = (view, i, x, y) => {
    centers.current[i] = clampInside(view, x, y)
    schedule()
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => nearestHandle(handles(), point) >= 0,
    onDown: (point) => {
      const i = nearestHandle(handles(), point)
      if (i < 0) return false
      grabbed.current = i
      select(i)
      canvasRef.current?.focus({ preventScroll: true })
      schedule()
      return true
    },
    onMove: ({ x, y }) => {
      if (grabbed.current < 0) return
      const view = viewNow()
      moveCenter(view, grabbed.current, view.wx(x), view.wy(y))
    },
    onUp: () => {
      grabbed.current = -1
      schedule()
    },
  })
  const onKeyDown = (event) => {
    const turn = pageStep(event)
    if (turn) {
      event.preventDefault()
      select((selectedRef.current + turn + centers.current.length) % centers.current.length)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const i = selectedRef.current
    moveCenter(viewNow(), i, centers.current[i][0] + step.dx * 0.05, centers.current[i][1] + step.dy * 0.05)
  }
  const reset = () => {
    centers.current = DEMO_CENTERS.map((c) => [...c])
    select(0)
    setMode('uniform')
    setCount(COUNT_DEFAULT)
    setSpacing(SPACING_DEFAULT)
    redraw()
  }

  return (
    <SimShell
      label="流線の出発点の置き方"
      switcher={<ModeSwitch variant="tabs" label="出発点の置き方" value={mode} onChange={setMode} options={MODES} />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label={`3 つの渦がある流れの流線と、その出発点の図。出発点の置き方を 3 通りに切り替えられます。渦の中心の丸をドラッグで動かせます。PageUp・PageDown で渦を選び、矢印キーで動かします（Shift で大きく）。選択中は渦 ${selected + 1}。`} />}
      legend={(
        <SimLegend
          ref={legend}
          items={[
            { key: 'seeds', swatch: 'var(--lane-1)', label: '出発点', value: '', minChars: 3 },
            { key: 'lines', swatch: 'var(--color-ink)', label: '流線', value: '', minChars: 5 },
            { key: 'vortex', label: '選んだ渦', value: '', minChars: 14 },
            ...(mode === 'spacing' ? [{ key: 'dsep', symbol: 'd_{\\mathrm{sep}}', label: '間隔', value: fmt(spacing, 2) }] : []),
          ]}
        />
      )}
      controls={(
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ViewStack
            active={mode}
            views={{
              uniform: <ParamSlider symbol="N" label="出発点の数" value={count} min={20} max={200} step={5} onChange={setCount} />,
              speed: <ParamSlider symbol="N" label="出発点の数" value={count} min={20} max={200} step={5} onChange={setCount} />,
              spacing: <ParamSlider symbol="d_{\mathrm{sep}}" label="線の間隔" value={spacing} min={0.08} max={0.25} step={0.01} onChange={setSpacing} format={(v) => v.toFixed(2)} />,
            }}
          />
        </>
      )}
    />
  )
}
