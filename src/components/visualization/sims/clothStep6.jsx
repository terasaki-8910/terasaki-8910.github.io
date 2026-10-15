import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawAxes, drawGravityLegend } from '../axes'
import { CHAIN_G, createChain, grabNode, maxChainStretch, moveGrab, nodeAt, nodeForces, nudge, releaseGrab, resetChain, snapGrab, stepChain } from './clothChain'
import { NODE_R, GRAB_SLOP, chainView, drawChain, drawForceArrows } from './clothChainDraw'
import { drawDivergedNotice } from './clothNetDraw'
import { fmtTime, runSteps } from './clothStepKit'

// 段階 6「鎖」: おもりをバネでつないで吊るした 1 次元の鎖。質点をつかんで揺らせる(矢印キーでは、選んだ質点を横や上下に弾く)。
// 選んだ質点には、重力 mg・上のバネの力 F₁・下のバネの力 F₂ の矢印と、その和(合力)を描く:
// 質点が受ける力は、つながっている全部のバネの力と重力のベクトルの和。計算は massSpring.js(springForce・massSpringStep)。
const DT = 0.004 // 時間刻み [s]
const MAX_STEPS = 16
const KICK = 0.8 // 矢印キー 1 回で足す速さ [m/s]

const fmtVec = (v) => `(${v[0] < 0 ? '−' : ''}${Math.abs(v[0]).toFixed(2)}, ${v[1] < 0 ? '−' : ''}${Math.abs(v[1]).toFixed(2)}) N`

export default function ClothStep6() {
  const [n, setN] = useState(6)
  const [k, setK] = useState(600)
  const [kd, setKd] = useState(0.3)
  const [sel, setSel] = useState(6)
  const [announce, setAnnounce] = useState('')

  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = createChain({ n: 6, k: 600, kd: 0.3 })
  const clock = useRef({ acc: 0, t: 0 })
  const legend = useRef(null)
  const params = useRef({})
  params.current = { method: 'springs', k, kd, iterations: 8 }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const view = chainView(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    drawGravityLegend(ctx, view, CHAIN_G, { colors })
    drawChain(ctx, view, world, colors, { selected: true })
    drawForceArrows(ctx, view, world, world.selected, nodeForces(world, world.selected), colors)
    if (world.diverged) drawDivergedNotice(ctx, width, height, colors, '計算が発散しました。リセットで戻せます')
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const publishLive = useCallback(() => {
    const world = worldRef.current
    const f = nodeForces(world, world.selected)
    legend.current?.update({
      t: fmtTime(clock.current.t),
      stretch: world.diverged ? '発散' : `${(maxChainStretch(world) * 100).toFixed(1)} %`,
      mg: fmtVec(f.gravity),
      f1: fmtVec(f.above),
      f2: world.selected < world.n ? fmtVec(f.below) : '（下のバネなし）',
      sum: fmtVec(f.total),
    })
  }, [])

  const loop = useSimLoop(
    (frameDt) => {
      const world = worldRef.current
      runSteps(clock.current, frameDt, DT, MAX_STEPS, (dt) => stepChain(world, params.current, dt))
      publishLive()
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 質点の数を変えたら、鎖を作り直す
  useEffect(() => {
    const world = createChain({ n, k, kd })
    worldRef.current = world
    setSel(world.selected)
    clock.current.acc = 0
    clock.current.t = 0
    publishLive()
    redraw()
  }, [n, publishLive, redraw]) // k・kd が変わっても作り直さない(stepChain が書き換える)

  useEffect(() => {
    worldRef.current.selected = sel
    publishLive()
    redraw()
  }, [sel, publishLive, redraw])

  // ---- つかむ ----
  const reach = () => (NODE_R + GRAB_SLOP) / chainView(sizeRef.current.width, sizeRef.current.height).scaleX
  const toWorld = ({ x, y }) => {
    const view = chainView(sizeRef.current.width, sizeRef.current.height)
    return { wx: view.wx(x), wy: view.wy(y) }
  }
  const settle = () => {
    if (!loop.running) {
      snapGrab(worldRef.current, 'springs')
      publishLive()
      redraw()
    }
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => {
      const { wx, wy } = toWorld(p)
      return !worldRef.current.diverged && nodeAt(worldRef.current, wx, wy, reach()) >= 0
    },
    onDown: (p) => {
      const { wx, wy } = toWorld(p)
      if (worldRef.current.diverged || !grabNode(worldRef.current, wx, wy, reach())) return false
      setSel(worldRef.current.selected)
      settle()
    },
    onMove: (p) => {
      const { wx, wy } = toWorld(p)
      moveGrab(worldRef.current, wx, wy)
      settle()
    },
    onUp: () => {
      releaseGrab(worldRef.current)
      publishLive()
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const kick = event.shiftKey ? 2.5 * KICK : KICK
    const moves = { ArrowLeft: [-kick, 0], ArrowRight: [kick, 0], ArrowUp: [0, kick], ArrowDown: [0, -kick] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    nudge(worldRef.current, move[0], move[1], worldRef.current.selected)
    setAnnounce(`質点 ${worldRef.current.selected} を弾いた`)
    if (!loop.running) loop.play()
  }

  function reset() {
    resetChain(worldRef.current)
    clock.current.acc = 0
    clock.current.t = 0
    publishLive()
    redraw()
  }

  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: fmtTime(0), minChars: 7 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${DT * 1000} ms` },
    { key: 'g', symbol: 'g', label: '重力', value: `${CHAIN_G.toFixed(1)} m/s² ↓` },
    { key: 'stretch', label: '最大の伸び', value: '0.0 %', minChars: 6 },
    { key: 'sel', label: `選んだ質点 ${sel} の力`, value: undefined },
    { key: 'mg', label: 'mg（重力）', value: '', minChars: 15 },
    { key: 'f1', label: 'F₁（上のバネ）', value: '', minChars: 15 },
    { key: 'f2', label: 'F₂（下のバネ）', value: '', minChars: 15 },
    { key: 'sum', label: '合力 = mg + F₁ + F₂', value: '', minChars: 15 },
  ]

  return (
    <SimShell
      label="鎖のシミュレーション"
      aspect={1.5}
      height={{ pc: [320, 400], phone: [280, 360] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="上の端を固定して、おもりをバネでつないで吊るした鎖。質点はドラッグでつかめる。矢印キーで、選んだ質点を弾ける。選んだ質点には重力と2本のバネの力の矢印と合力が描かれる"
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={legendItems} />
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="n" label="質点の数" unit="個" value={n} min={2} max={10} step={1} onChange={setN} />
          <ParamSlider symbol="i" label="力を見る質点" value={Math.min(sel, n)} min={1} max={n} step={1} onChange={setSel} />
          <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={200} max={1500} step={10} onChange={setK} />
          <ParamSlider symbol="k_d" label="減衰係数" unit="N·s/m" value={kd} min={0} max={2} step={0.1} onChange={setKd} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
