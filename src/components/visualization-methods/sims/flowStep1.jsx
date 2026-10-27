import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, fmt } from '../../visualization/sims/rigidKit'
import { vortexField } from '../../../utils/vis/flow'
import { HANDLE_HIT, SPEED_SWATCH, clampInside, clipToFrame, drawArrowBatches, drawHandle, fitView, speedBin, speedLut } from './flowKit'

const X_RANGE = [0, 2]
const Y_RANGE = [0, 1]
const CENTER = [1, 0.5]
const UNIFORM = [0.35, 0]
const STRENGTH = 0.9
const CORE = 0.14
const K = 0.22 // 矢印の長さの倍率(世界の長さ ÷ 速さ)
const VMAX = 0.8 // 色の上端にする速さ
const STRETCH = 2.2 // 境界に合わせた格子の寄せ方(大きいほど下の辺に点が集まる)
const UNIT_LENGTH = 0.8 // 長さをそろえるときの矢印の長さ(格子の幅の何倍か)

export default function FlowStep1() {
  const [density, setDensity] = useState(14)
  const [fitted, setFitted] = useState(false)
  const [unit, setUnit] = useState(false)
  const state = useRef(null)
  state.current = { density, fitted, unit }
  const center = useRef([...CENTER])
  const grabbed = useRef(false)
  const legend = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const s = state.current
    const view = fitView(width, height, X_RANGE, Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const field = vortexField([{ x: center.current[0], y: center.current[1], strength: STRENGTH, core: CORE }], UNIFORM)
    const [x0, x1] = view.xRange
    const [y0, y1] = view.yRange
    const nx = s.density
    const dx = (x1 - x0) / nx
    const ny = Math.max(2, Math.round((y1 - y0) / dx))
    const ys = Array.from({ length: ny }, (_, j) => y0 + (y1 - y0) * (s.fitted ? ((j + 0.5) / ny) ** STRETCH : (j + 0.5) / ny))
    const lut = speedLut(colors)
    const scale = view.scaleX
    const data = new Float32Array(5 * nx * ny)
    const dots = new Float32Array(5 * nx * ny)
    let count = 0
    let overlap = 0
    for (let j = 0; j < ny; j++) {
      const gap = Math.min(j > 0 ? ys[j] - ys[j - 1] : Infinity, j < ny - 1 ? ys[j + 1] - ys[j] : Infinity)
      const room = Math.min(dx, gap) * scale // 隣の格子点までの距離(px)
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * dx
        const y = ys[j]
        const v = field(x, y)
        const speed = Math.hypot(v[0], v[1])
        const length = (s.unit ? UNIT_LENGTH * dx : K * speed) * scale
        const ux = speed > 1e-9 ? v[0] / speed : 0
        const uy = speed > 1e-9 ? v[1] / speed : 0
        const o = count * 5
        data[o] = view.sx(x)
        data[o + 1] = view.sy(y)
        data[o + 2] = data[o] + ux * length
        data[o + 3] = data[o + 1] - uy * length
        data[o + 4] = s.unit ? speedBin(speed, VMAX) : 0
        dots[o] = data[o]
        dots[o + 1] = data[o + 1]
        dots[o + 2] = data[o] + 0.1
        dots[o + 3] = data[o + 1]
        dots[o + 4] = data[o + 4]
        if (length > room) overlap++
        count++
      }
    }
    clipToFrame(ctx, view, () => {
      drawArrowBatches(ctx, dots, count, lut, { width: 3 })
      drawArrowBatches(ctx, data, count, lut, { width: 1.4, headMax: 6 })
      drawHandle(ctx, view.sx(center.current[0]), view.sy(center.current[1]), colors, grabbed.current)
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    legend.current?.update({
      count: String(count),
      overlap: `${overlap} 本`,
      center: `(${fmt(center.current[0], 2)}, ${fmt(center.current[1], 2)})`,
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [density, fitted, unit, redraw])

  const viewNow = () => fitView(sizeRef.current.width, sizeRef.current.height, X_RANGE, Y_RANGE)
  const hit = (point) => {
    const view = viewNow()
    return Math.hypot(point.x - view.sx(center.current[0]), point.y - view.sy(center.current[1])) <= HANDLE_HIT
  }
  const moveTo = (view, x, y) => {
    center.current = clampInside(view, x, y)
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      grabbed.current = true
      canvasRef.current?.focus({ preventScroll: true })
      redraw()
      return true
    },
    onMove: ({ x, y }) => {
      const view = viewNow()
      moveTo(view, view.wx(x), view.wy(y))
    },
    onUp: () => {
      grabbed.current = false
      redraw()
    },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    moveTo(viewNow(), center.current[0] + step.dx * 0.05, center.current[1] + step.dy * 0.05)
  }
  const reset = () => {
    center.current = [...CENTER]
    setDensity(14)
    setFitted(false)
    setUnit(false)
    redraw()
  }

  return (
    <SimShell
      label="格子点ごとの速度を矢印で描く"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="一様な流れの中に渦がある速度の場を、格子点ごとの矢印で描いた図。渦の中心の丸をドラッグするか矢印キーで動かせます。" />}
      legend={(
        <SimLegend
          ref={legend}
          items={[
            { key: 'arrow', symbol: 'k\\,|\\boldsymbol{v}|', label: '矢印の長さ', value: unit ? 'すべて同じ' : '速さに比例' },
            ...(unit ? [{ key: 'speed', label: '速さの色', value: '遅い → 速い', swatch: SPEED_SWATCH }] : []),
            { key: 'grid', label: '格子', value: fitted ? '下の辺に寄せる' : '等間隔' },
            { key: 'count', label: '矢印の数', value: '', minChars: 4 },
            { key: 'overlap', label: '隣に重なる矢印', value: '', minChars: 6 },
            { key: 'center', label: '渦の中心', value: '', minChars: 12 },
          ]}
        />
      )}
      controls={(
        <>
          <SimToolbar>
            <ResetButton onClick={reset} />
            <ToggleButton pressed={fitted} onChange={setFitted}>境界に合わせた格子</ToggleButton>
            <ToggleButton pressed={unit} onChange={setUnit}>長さをそろえる</ToggleButton>
          </SimToolbar>
          <ParamSlider symbol="n_x" label="格子の密度（横の点の数）" value={density} min={6} max={30} step={1} onChange={setDensity} />
        </>
      )}
    />
  )
}
