import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { createPressure, recomputePressure, pushPressure, maxAbs } from './nsSteps.js'
import { fieldView, inside, drawField, drawVelocity, drawPush, fieldAxes, keyDirection } from './nsStepDraw.js'

// 段階 4「圧力」: 32×32 の周期格子で、右向きの噴流 u* の発散を、圧力 q で押し戻して 0 にする(射影)。
// 「直す前・圧力 q・直した後」を切り替え、ガウス・ザイデル法の回数を変えると、残る発散が変わる。ドラッグで u* を押せる。
// 時間は進めない。計算は nsSteps.js(grid.js の divergence2D・projectPeriodic2D)。
const MODES = [
  { value: 'before', label: '直す前' },
  { value: 'pressure', label: '圧力 q' },
  { value: 'after', label: '直した後' },
]

export default function NsStep4() {
  const [iterations, setIterations] = useState(60)
  const [mode, setMode] = useState('before')
  const world = useRef(null)
  if (!world.current) world.current = createPressure()
  const hand = useRef(null)
  const legend = useRef(null)
  const raster = useRef(null)
  const { canvasRef, redraw, sizeRef } = useCanvas({
    draw: (args) => {
      const w = world.current,
        pressure = mode === 'pressure'
      const field = pressure ? w.correction : mode === 'before' ? w.before : w.after
      const values = pressure ? w.q : mode === 'before' ? w.divBefore : w.divAfter
      const scale = pressure ? w.qScale : w.divScale
      const view = drawField(args, raster, field, values, scale, true)
      drawVelocity(args.ctx, view, field, args.colors.ink)
      drawPush(args.ctx, view, hand.current, args.colors)
      fieldAxes(args.ctx, view, args.colors)
      const before = maxAbs(w.divBefore),
        after = maxAbs(w.divAfter)
      legend.current?.update({
        iterations: String(w.iterations),
        before: `${before.toExponential(3)} s⁻¹`,
        after: `${after.toExponential(3)} s⁻¹`,
        ratio: before ? `${((100 * after) / before).toFixed(3)} %` : '0 %',
        scale: `±${scale.toPrecision(3)} ${pressure ? 'm²/s' : 's⁻¹'}`,
        arrows: pressure ? '−∇q（直した後 − 直す前）' : mode === 'before' ? 'u*（直す前）' : 'u（直した後）',
      })
    },
  })
  useEffect(() => {
    recomputePressure(world.current, iterations)
    redraw()
  }, [iterations, redraw])
  useEffect(() => {
    redraw()
  }, [mode, redraw])
  const viewNow = () => fieldView(sizeRef.current.width, sizeRef.current.height)
  usePointerDrag(canvasRef, {
    canGrab: (p) => inside(viewNow(), p),
    onDown: (p) => {
      const view = viewNow()
      if (!inside(view, p)) return false
      canvasRef.current?.focus({ preventScroll: true })
      hand.current = { x: view.wx(p.x), y: view.wy(p.y), fx: 0, fy: 0 }
    },
    onMove: (p) => {
      const view = viewNow()
      if (!inside(view, p)) {
        hand.current = null
        redraw()
        return
      }
      const x = view.wx(p.x),
        y = view.wy(p.y)
      // 移動距離に比例させるので、同じ線をゆっくり描いても速く描いても同じ押しになる。
      const fx = (4 * p.dx) / view.scaleX,
        fy = (-4 * p.dy) / view.scaleY
      hand.current = { x, y, fx, fy }
      pushPressure(world.current, x, y, fx, fy, iterations)
      redraw()
    },
    onUp: () => {
      hand.current = null
      redraw()
    },
  })
  function onKeyDown(event) {
    const direction = keyDirection(event)
    if (!direction) return
    const strength = event.shiftKey ? 0.6 : 0.2
    pushPressure(world.current, 0.5, 0.5, direction[0] * strength, direction[1] * strength, iterations)
    redraw()
  }
  return (
    <SimShell
      label="圧力で発散を取り除くシミュレーション"
      aspect={1}
      switcher={<ModeSwitch variant="tabs" label="圧力の表示" value={mode} onChange={setMode} options={MODES} />}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="32×32の周期格子。直す前と後の発散、圧力 q を切り替えて見る。矢印は速度または圧力による修正。ドラッグまたは矢印キーで直す前の速度を押して再計算する。Shift は強く押す"
        />
      }
      legend={
        <SimLegend
          ref={legend}
          items={[
            { key: 'iterations', label: '回数', value: '' },
            { key: 'before', label: 'max |∇·u*|（前）', value: '' },
            { key: 'after', label: 'max |∇·u|（後）', value: '' },
            { key: 'ratio', label: '後 / 前', value: '' },
            {
              key: 'scale',
              label: '色の尺度',
              value: '',
              swatch: 'linear-gradient(to right, var(--diff-delete), var(--color-paper), var(--lane-1))',
            },
            { label: '尺度', value: '初期状態から固定（前後は共通）' },
            { key: 'arrows', label: '矢印', value: '' },
          ]}
        />
      }
      controls={
        <>
          <SimToolbar>
            <ResetButton
              onClick={() => {
                world.current = createPressure(iterations)
                hand.current = null
                redraw()
              }}
            />
          </SimToolbar>
          <ParamSlider label="ガウス・ザイデルの回数" value={iterations} min={0} max={200} step={1} onChange={setIterations} />
        </>
      }
    />
  )
}
