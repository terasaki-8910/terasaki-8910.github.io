import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawAxes } from '../axes.js'
import { DT } from './nsWorld.js'
import { CELLS, DX1, cellX, clamp, createLine, advanceLine, paintLine } from './nsSteps.js'
import { TICKS, lineView, inside, clipField, keyDirection } from './nsStepDraw.js'

// 段階 3「粘性」: 1 次元の 40 マス(周期境界)で、速さの分布が両隣の平均に近づいてなだらかになる。
// 棒をドラッグで塗り直せる。和 Σu_i·Δx は変わらず、a = νΔt/Δx² が 1/2 を超えると発散する。
// 計算は nsSteps.js(grid.js の diffuse1D)。
export default function NsStep3() {
  const [nu, setNu] = useState(0.005)
  const world = useRef(null)
  if (!world.current) world.current = createLine('diffuse')
  const hand = useRef(null)
  const legend = useRef(null)
  const { canvasRef, redraw, sizeRef } = useCanvas({
    draw: ({ ctx, width, height, colors }) => {
      const w = world.current,
        view = lineView(width, height, true)
      const sum = w.values.reduce((a, b) => a + b, 0) * DX1
      ctx.fillStyle = colors.paper
      ctx.fillRect(0, 0, width, height)
      ctx.save()
      clipField(ctx, view)
      ctx.fillStyle = colors.alpha('lane-1', 1)
      w.values.forEach((value, i) => {
        const y = view.sy(clamp(value, -1, 1.5)),
          zero = view.sy(0)
        const barWidth = Math.max(1, view.scaleX * DX1 * 0.55)
        ctx.fillRect(view.sx(cellX(i)) - barWidth / 2, Math.min(y, zero), barWidth, Math.max(1, Math.abs(zero - y)))
      })
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(view.sx(0), view.sy(clamp(sum, -1, 1.5)))
      ctx.lineTo(view.sx(1), view.sy(clamp(sum, -1, 1.5)))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = colors.ink
      ctx.strokeRect(view.sx(w.selected * DX1), view.frame.top, view.scaleX * DX1, view.frame.height)
      ctx.restore()
      drawAxes(ctx, view, {
        colors,
        xLabel: 'x [m]',
        yLabel: 'u [m/s]',
        xTicks: TICKS,
        yTicks: { step: 0.5, values: [-1, -0.5, 0, 0.5, 1, 1.5] },
      })
      const a = (nu * DT) / DX1 ** 2
      legend.current?.update({
        nu: `${nu.toFixed(4)} m²/s`,
        a: `${a.toFixed(3)}${a > 0.5 ? '：1/2 を超えた：発散する' : ''}`,
        sum: `${sum.toPrecision(6)} m²/s`,
        max: `${Math.max(...w.values).toPrecision(4)} m/s${w.diverged ? '：発散した' : ''}`,
        t: `${w.time.toFixed(2)} s`,
        selected: `${w.selected + 1} / ${CELLS}：${w.values[w.selected].toPrecision(4)} m/s`,
      })
    },
  })
  const loop = useSimLoop(
    (elapsed) => {
      advanceLine(world.current, elapsed, { kind: 'diffuse', nu })
      redraw()
    },
    { targetRef: canvasRef },
  )
  useEffect(() => {
    world.current = createLine('diffuse')
    redraw()
  }, [nu, redraw])
  const viewNow = () => lineView(sizeRef.current.width, sizeRef.current.height, true)
  const locate = (p) => {
    const v = viewNow()
    return { x: clamp(v.wx(p.x), 0, 1), y: clamp(v.wy(p.y), -1, 1.5) }
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => inside(viewNow(), p),
    onDown: (p) => {
      if (!inside(viewNow(), p)) return false
      canvasRef.current?.focus({ preventScroll: true })
      hand.current = locate(p)
      paintLine(world.current, hand.current, hand.current)
      redraw()
    },
    onMove: (p) => {
      if (!hand.current) return
      const next = locate(p)
      paintLine(world.current, hand.current, next)
      hand.current = next
      redraw()
    },
    onUp: () => {
      hand.current = null
    },
  })
  function onKeyDown(event) {
    const direction = keyDirection(event)
    if (!direction) return
    const w = world.current
    if (direction[0]) w.selected = clamp(w.selected + direction[0], 0, CELLS - 1)
    else if (!w.diverged) w.values[w.selected] = clamp(w.values[w.selected] + direction[1] * (event.shiftKey ? 0.5 : 0.1), -1, 1.5)
    redraw()
  }
  return (
    <SimShell
      label="1次元の粘性のシミュレーション"
      aspect={1.6}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="40マスの周期境界の粘性。棒は速度、破線は平均。グラフをドラッグすると速度を塗れる。左右キーでマスを選び、上下キーで速度を変える。Shift は変化を大きくする"
        />
      }
      legend={
        <SimLegend
          ref={legend}
          items={[
            { key: 'nu', label: 'ν', value: '' },
            { label: 'Δt', value: '1/60 s' },
            { label: 'Δx', value: '0.025 m' },
            { key: 'a', label: 'a', value: '' },
            { label: 'a = νΔt/Δx²' },
            { key: 'sum', label: '和 Σu_i·Δx', value: '' },
            { key: 'max', label: 'u の最大', value: '' },
            { key: 't', label: 't', value: '' },
            { label: '破線', value: '平均（和は塗り直すと変わる）' },
            { key: 'selected', label: '選択したマス', value: '' },
          ]}
        />
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton
              onClick={() => {
                world.current = createLine('diffuse')
                redraw()
              }}
            />
          </SimToolbar>
          <ParamSlider
            label="動粘性係数 ν"
            unit="m²/s"
            value={nu}
            min={0}
            max={0.025}
            step={0.0005}
            onChange={setNu}
            format={(v) => v.toFixed(4)}
          />
        </>
      }
    />
  )
}
