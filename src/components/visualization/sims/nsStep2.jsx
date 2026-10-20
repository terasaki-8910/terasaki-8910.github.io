import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawAxes, drawArrow } from '../axes.js'
import { DT } from './nsWorld.js'
import { CELLS, DX1, cellAt, cellX, clamp, createLine, advanceLine, exactPulse, probeCells } from './nsSteps.js'
import { TICKS, lineView, clipField } from './nsStepDraw.js'

// 段階 2「移流」: 1 次元の 40 マスで、速さ c で流れる四角い山を「さかのぼる方法」と「風上差分」で比べる。
// 破線は厳密解(初めの山を c·t ずらしたもの)。調べるマスの印をドラッグすると、さかのぼる矢印と使う 2 マスが見える。
// クーラン数 |c|Δt/Δx が 1 を超えると、風上差分だけが発散する。計算は nsSteps.js(grid.js の advectSemiLagrangian1D・advectUpwind1D)。
const METHODS = [
  { value: 'semi', label: 'さかのぼる' },
  { value: 'upwind', label: '風上差分' },
]
const millis = (dt) => (dt * 1000).toFixed(2)

export default function NsStep2() {
  const [c, setC] = useState(0.5)
  const [dt, setDt] = useState(DT)
  const [method, setMethod] = useState('semi')
  const world = useRef(null)
  if (!world.current) world.current = createLine('advect')
  const probe = useRef(20)
  const legend = useRef(null)
  const { canvasRef, redraw, sizeRef } = useCanvas({
    draw: ({ ctx, width, height, colors }) => {
      const w = world.current,
        view = lineView(width, height)
      const { cells, back } = probeCells(probe.current, c, dt, method)
      ctx.fillStyle = colors.paper
      ctx.fillRect(0, 0, width, height)
      ctx.save()
      clipField(ctx, view)
      ctx.fillStyle = colors.alpha('lane-1', 0.15)
      for (const i of new Set(cells)) ctx.fillRect(view.sx(i * DX1), view.frame.top, view.scaleX * DX1, view.frame.height)
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      exactPulse(c, w.time).forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
        else ctx.lineTo(view.sx(x), view.sy(y))
      })
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = colors.alpha('lane-1', 1)
      ctx.beginPath()
      w.values.forEach((value, i) => {
        const x = view.sx(cellX(i)),
          y = view.sy(clamp(value, -0.5, 1.5))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.fillStyle = colors.alpha('lane-1', 1)
      w.values.forEach((value, i) => {
        ctx.beginPath()
        ctx.arc(view.sx(cellX(i)), view.sy(clamp(value, -0.5, 1.5)), cells.includes(i) ? 4 : 2, 0, 2 * Math.PI)
        ctx.fill()
      })
      drawArrow(ctx, view, cellX(probe.current), 1.3, back, 1.3, { color: colors.ink, width: 2, head: 5 })
      ctx.restore()
      drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'φ', xTicks: TICKS, yTicks: { step: 0.5, values: [-0.5, 0, 0.5, 1, 1.5] } })
      // 目盛りの下に、つかめる調査マスの印を置く。
      const px = view.sx(cellX(probe.current)),
        py = view.frame.bottom + 49
      ctx.fillStyle = colors.ink
      ctx.beginPath()
      ctx.moveTo(px, py - 5)
      ctx.lineTo(px - 5, py + 4)
      ctx.lineTo(px + 5, py + 4)
      ctx.closePath()
      ctx.fill()
      const cfl = (Math.abs(c) * dt) / DX1
      legend.current?.update({
        method: METHODS.find((m) => m.value === method).label,
        t: `${w.time.toFixed(2)} s`,
        c: `${c.toFixed(2)} m/s`,
        dt: `${millis(dt)} ms`,
        cfl: `${cfl.toFixed(2)}${cfl > 1 ? '：1 を超えた' : ''}`,
        max: `${Math.max(...w.values).toPrecision(4)}${w.diverged ? '：発散した' : ''}`,
        probe: `${probe.current + 1} / ${CELLS}（x = ${cellX(probe.current).toFixed(4)} m）`,
      })
    },
  })
  const loop = useSimLoop(
    (elapsed) => {
      advanceLine(world.current, elapsed, { kind: 'advect', c, dt, method })
      redraw()
    },
    { targetRef: canvasRef },
  )
  useEffect(() => {
    world.current = createLine('advect', c)
    redraw()
  }, [c, dt, method, redraw])
  const viewNow = () => lineView(sizeRef.current.width, sizeRef.current.height)
  const hit = (p) => {
    const view = viewNow()
    return Math.hypot(p.x - view.sx(cellX(probe.current)), p.y - (view.frame.bottom + 49)) <= 16
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (p) => {
      if (!hit(p)) return false
      canvasRef.current?.focus({ preventScroll: true })
    },
    onMove: (p) => {
      probe.current = cellAt(viewNow().wx(p.x))
      redraw()
    },
  })
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    probe.current = clamp(probe.current + (event.key === 'ArrowRight' ? 1 : -1), 0, CELLS - 1)
    redraw()
  }
  return (
    <SimShell
      label="1次元の移流のシミュレーション"
      aspect={1.6}
      switcher={<ModeSwitch variant="tabs" label="移流の方法" value={method} onChange={setMethod} options={METHODS} />}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="40マスの移流。点つきの実線は計算値、破線は厳密解。軸の下の印を左右にドラッグするか左右キーで調べるマスを動かす。矢印はさかのぼる位置、色のついたマスは計算に使う値"
        />
      }
      legend={
        <SimLegend
          ref={legend}
          items={[
            { key: 'method', label: '方法', value: '' },
            { key: 't', label: 't', value: '' },
            { key: 'c', label: 'c', value: '' },
            { key: 'dt', label: 'Δt', value: '' },
            { label: 'Δx', value: '0.025 m' },
            { key: 'cfl', label: 'クーラン数 |c|Δt/Δx', value: '' },
            { key: 'max', label: 'φ の最大', value: '' },
            { key: 'probe', label: '調べるマス', value: '' },
            { label: '線', value: '実線：計算値／破線：厳密解' },
          ]}
        />
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton
              onClick={() => {
                world.current = createLine('advect', c)
                redraw()
              }}
            />
          </SimToolbar>
          <ParamSlider
            label="流れの速さ c"
            unit="m/s"
            value={c}
            min={-1}
            max={1}
            step={0.05}
            onChange={setC}
            format={(v) => v.toFixed(2)}
          />
          <ParamSlider
            label="時間刻み Δt"
            unit="ms"
            value={dt}
            min={1 / 240}
            max={1 / 12}
            step={1 / 240}
            onChange={setDt}
            format={millis}
          />
        </>
      }
    />
  )
}
