import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { DT } from './nsWorld.js'
import { emptyField, forcePoint, applyForce, FORCE_RADIUS } from './nsSteps.js'
import { fieldView, inside, drawField, drawVelocity, drawPush, fieldAxes, keyDirection } from './nsStepDraw.js'

// 段階 1「外力」: 32×32 の周期格子(1 m 四方)で、ほかの項を全部切り、押した所の速度に Δt·F·exp(−d²/r²) を毎フレーム足す。
// 押している間だけ速度が増え、離すとそのまま残る。押した点の速さが F·t_p と一致することを凡例で比べる。
// 計算は nsSteps.js(utils/vis/grid.js の addSplat2D)。
export default function NsStep1() {
  const [force, setForce] = useState(8)
  const world = useRef(null)
  if (!world.current) world.current = emptyField()
  const hand = useRef(null)
  const probe = useRef(forcePoint(0.5, 0.5))
  const heldTime = useRef(0)
  const prediction = useRef(0)
  const acc = useRef(0)
  const legend = useRef(null)
  const raster = useRef(null)
  const speeds = useRef(new Float64Array(32 ** 2))
  const { canvasRef, redraw, sizeRef } = useCanvas({
    draw: (args) => {
      const w = world.current
      for (let k = 0; k < w.u.length; k++) speeds.current[k] = Math.hypot(w.u[k], w.v[k])
      const view = drawField(args, raster, w, speeds.current, 2)
      drawVelocity(args.ctx, view, w, args.colors.ink)
      drawPush(args.ctx, view, hand.current, args.colors)
      fieldAxes(args.ctx, view, args.colors)
      legend.current?.update({
        force: `${force * (hand.current?.multiplier ?? 1)} m/s²`,
        tp: `${heldTime.current.toFixed(2)} s`,
        speed: `${speeds.current[probe.current.k].toFixed(3)} m/s`,
        prediction: `${prediction.current.toFixed(3)} m/s`,
      })
    },
  })
  const loop = useSimLoop(
    (elapsed) => {
      const p = hand.current
      if (!p?.inside) return
      acc.current += elapsed
      while (acc.current + 1e-12 >= DT) {
        applyForce(world.current, p, force * p.multiplier, [p.fx, p.fy])
        heldTime.current += DT
        prediction.current += force * p.multiplier * DT
        acc.current = Math.max(0, acc.current - DT)
      }
      redraw()
    },
    { targetRef: canvasRef, autoStart: false },
  )
  useEffect(() => {
    redraw()
  }, [force, redraw])

  const viewNow = () => fieldView(sizeRef.current.width, sizeRef.current.height)
  const begin = (point, direction = [1, 0], multiplier = 1, key = null) => {
    probe.current = point
    hand.current = { ...point, fx: direction[0], fy: direction[1], multiplier, key, inside: true }
    heldTime.current = 0
    prediction.current = 0
    acc.current = 0
    loop.play()
    redraw()
  }
  const end = () => {
    hand.current = null
    acc.current = 0
    loop.pause()
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => inside(viewNow(), p),
    onDown: (p) => {
      const view = viewNow()
      if (!inside(view, p)) return false
      canvasRef.current?.focus({ preventScroll: true })
      begin(forcePoint(view.wx(p.x), view.wy(p.y)))
    },
    onMove: (p) => {
      const view = viewNow(),
        h = hand.current
      if (!h) return
      h.inside = inside(view, p)
      if (h.inside) {
        const point = forcePoint(view.wx(p.x), view.wy(p.y))
        Object.assign(h, point)
        probe.current = point
        if (p.dx || p.dy) {
          h.fx = p.dx / view.scaleX
          h.fy = -p.dy / view.scaleY
        }
      }
      redraw()
    },
    onUp: end,
  })
  function onKeyDown(event) {
    const direction = keyDirection(event)
    if (!direction) return
    if (hand.current?.key === event.key) return
    begin(forcePoint(0.5, 0.5), direction, event.shiftKey ? 3 : 1, event.key)
  }
  return (
    <SimShell
      label="外力だけを加えるシミュレーション"
      aspect={1}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (hand.current?.key === e.key) end()
          }}
          onBlur={end}
          label="32×32 の周期格子。色は速さ、矢印は速度。マスを押し続けると加速し、ドラッグで力の向きを変える。矢印キーを押し続けると中央を押す。Shift は力が3倍"
        />
      }
      legend={
        <SimLegend
          ref={legend}
          items={[
            { key: 'force', label: '力 F', value: '' },
            { label: 'Δt', value: '1/60 s' },
            { key: 'tp', label: '押している時間 t_p', value: '' },
            { key: 'speed', label: '中心の速さ |u|', value: '' },
            { key: 'prediction', label: '増分の予測 F·t_p', value: '' },
            { label: 'r', value: `${FORCE_RADIUS} m` },
            { label: '速さの色', value: '0 → 2 m/s', swatch: 'linear-gradient(to right, var(--color-paper), var(--lane-1))' },
          ]}
        />
      }
      controls={
        <>
          <SimToolbar>
            <ResetButton
              onClick={() => {
                world.current = emptyField()
                heldTime.current = 0
                prediction.current = 0
                end()
              }}
            />
          </SimToolbar>
          <ParamSlider
            label="力の大きさ F"
            unit="m/s²"
            value={force}
            min={0}
            max={20}
            step={0.5}
            onChange={(value) => {
              heldTime.current = 0
              prediction.current = 0
              setForce(value)
            }}
          />
        </>
      }
    />
  )
}
