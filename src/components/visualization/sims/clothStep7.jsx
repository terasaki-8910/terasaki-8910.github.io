import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ToggleButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawAxes, drawGravityLegend, makeView } from '../axes'
import {
  GRAVITY,
  applyPins,
  createClothWorld,
  grabNode,
  isPinned,
  latticeStableDt,
  maxStretch,
  moveGrab,
  nudgeAll,
  releaseGrab,
  resetCloth,
  snapGrab,
  stepCloth,
} from './clothWorld'
import { drawDivergedNotice, drawNet } from './clothNetDraw'
import { fmtMs, fmtTime, runSteps } from './clothStepKit'

// 段階 7「網」: 鎖を縦にも横にも並べてつなぐと網(布)になる。全体のシミュレーションと同じ網の小さい版(7 × 5 個)。
// 縦横のバネだけだと四角が平行四辺形につぶれる(ずれに弱い)ので、斜めのバネを足すと形を保つ。斜めのバネの切り替えで確かめる。
// 質点をつかんで揺らせる(矢印キーでは、網全体を横や上下に弾く)。計算は clothWorld.js(massSpring.js の massSpringStep)。
const SMALL = { cols: 7, rows: 5, spacing: 0.3, worldW: 2.4, worldH: 2.2 }
const DT = 0.003 // 時間刻み [s]
const MAX_STEPS = 16
const GRAB_RADIUS_PX = 22
const KICK = 0.6 // 矢印キー 1 回で足す速さ [m/s]
const MARGIN = { left: 40, right: 12, top: 24, bottom: 36 }
const viewOf = (width, height) => makeView({ width, height, xRange: [0, SMALL.worldW], yRange: [0, SMALL.worldH], margin: MARGIN })
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function ClothStep7() {
  const [diagonals, setDiagonals] = useState(true)
  const [pin, setPin] = useState('corners')
  const [k, setK] = useState(300)
  const [kd, setKd] = useState(0.5)
  const [announce, setAnnounce] = useState('')

  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = createClothWorld({ ...SMALL, pin: 'corners', k: 300, kd: 0.5 })
  const clock = useRef({ acc: 0, t: 0 })
  const legend = useRef(null)
  const params = useRef({})
  params.current = { method: 'springs', k, kd, iterations: 6, windSpeed: 0, CD: 1, CL: 0, diagonals }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    drawGravityLegend(ctx, view, GRAVITY, { colors })
    drawNet(ctx, view, world, colors, { diagonals: params.current.diagonals })
    if (world.diverged) drawDivergedNotice(ctx, width, height, colors, '計算が発散しました。リセットで戻せます')
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const publishLive = useCallback(() => {
    const world = worldRef.current
    legend.current?.update({
      t: fmtTime(clock.current.t),
      stretch: world.diverged ? '発散' : `${(maxStretch(world, params.current.diagonals) * 100).toFixed(1)} %`,
    })
  }, [])

  const loop = useSimLoop(
    (frameDt) => {
      const world = worldRef.current
      runSteps(clock.current, frameDt, DT, MAX_STEPS, (dt) => stepCloth(world, params.current, dt))
      publishLive()
      redraw()
    },
    { targetRef: canvasRef },
  )

  useEffect(() => {
    applyPins(worldRef.current, pin)
    publishLive()
    redraw()
  }, [pin, publishLive, redraw])

  useEffect(() => {
    publishLive()
    redraw()
  }, [diagonals, publishLive, redraw])

  // ---- つかむ ----
  const toWorld = ({ x, y }) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    return { wx: clamp(view.wx(x), 0, SMALL.worldW), wy: clamp(view.wy(y), 0, SMALL.worldH), scale: view.scaleX }
  }
  const overNode = (p) => {
    const world = worldRef.current
    if (world.diverged) return false
    const { wx, wy, scale } = toWorld(p)
    const reach = GRAB_RADIUS_PX / scale
    const { pos } = world.state
    for (let i = 0; i < world.state.n; i++) {
      if (isPinned(world, i)) continue
      const dx = wx - pos[2 * i]
      const dy = wy - pos[2 * i + 1]
      if (dx * dx + dy * dy <= reach * reach) return true
    }
    return false
  }
  const settle = () => {
    if (!loop.running) {
      snapGrab(worldRef.current)
      publishLive()
      redraw()
    }
  }
  usePointerDrag(canvasRef, {
    canGrab: overNode,
    onDown: (p) => {
      const { wx, wy, scale } = toWorld(p)
      if (worldRef.current.diverged || !grabNode(worldRef.current, wx, wy, GRAB_RADIUS_PX / scale)) return false
      settle()
    },
    onMove: (p) => {
      const { wx, wy } = toWorld(p)
      moveGrab(worldRef.current, wx, wy)
      settle()
    },
    onUp: () => {
      releaseGrab(worldRef.current)
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
    nudgeAll(worldRef.current, move[0], move[1])
    setAnnounce('網を弾いた')
    if (!loop.running) loop.play()
  }

  function reset() {
    resetCloth(worldRef.current)
    clock.current.acc = 0
    clock.current.t = 0
    publishLive()
    redraw()
  }

  const limit = latticeStableDt(k, kd)
  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: fmtTime(0), minChars: 7 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: fmtMs(DT) },
    { key: 'g', symbol: 'g', label: '重力', value: `${GRAVITY.toFixed(1)} m/s² ↓` },
    { key: 'limit', label: '安定の限界（目安）', value: `${fmtMs(limit)}${DT > limit ? '：超えている' : ''}` },
    { key: 'stretch', label: '最大の伸び', value: '0.0 %', minChars: 6 },
    { key: 'diag', label: '斜めのバネ', value: diagonals ? 'あり（細い線）' : 'なし（縦横だけ）' },
  ]

  return (
    <SimShell
      label="網のシミュレーション"
      aspect={1.5}
      height={{ pc: [320, 400], phone: [280, 360] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="質点を縦横と斜めのバネでつないだ小さな網が、上から吊られて重力で垂れ下がる。質点はドラッグでつかめる。矢印キーで網全体を弾ける"
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
            <ToggleButton pressed={diagonals} onChange={setDiagonals}>
              斜めのバネ
            </ToggleButton>
            <ModeSwitch
              variant="quiet"
              label="固定する所"
              value={pin}
              onChange={setPin}
              options={[
                { value: 'corners', label: '上の両端' },
                { value: 'edge', label: '上の辺' },
              ]}
            />
          </SimToolbar>
          <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={100} max={800} step={10} onChange={setK} />
          <ParamSlider symbol="k_d" label="減衰係数" unit="N·s/m" value={kd} min={0} max={2} step={0.1} onChange={setKd} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
