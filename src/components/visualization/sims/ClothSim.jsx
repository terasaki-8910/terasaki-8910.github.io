import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawArrow, drawAxes, drawGravityLegend, makeView } from '../axes'
import {
  WORLD_W,
  WORLD_H,
  GRAVITY,
  createClothWorld,
  resetCloth,
  applyPins,
  isPinned,
  stepCloth,
  grabNode,
  moveGrab,
  snapGrab,
  releaseGrab,
  nudgeAll,
  stableDt,
  latticeStableDt,
  maxStretch,
} from './clothWorld'
import { drawDivergedNotice, drawNet } from './clothNetDraw'
import { drawText } from './clothDraw'
import { fmtTime, runSteps } from './clothStepKit'

// 節「バネ-質点系と位置ベース法」の全体のシミュレーション。2 次元の網を、質点-ばね系(半陰的オイラー法)と
// 位置ベース法のどちらでも進められる。切り替えても同じ質点の状態(位置・速度)を引き継ぐ。
// 計算は clothWorld.js(massSpring.js・pbd.js の関数を呼ぶ)、ここは画面と操作。
// 凡例: 軸は x [m]・y [m](canvas の中)、重力 g(絵の右上の矢印)、風 U(左の矢印と文字)、t・Δt・安定の限界・最大の伸び(絵の下)。
// 毎フレーム変わる値(t、最大の伸び)は legend.update で文字だけ書き換える。
const ASPECT = 1.27 // 4 m × 3 m の枠に軸の余白(左右 56px、上下 66px)を足した縦横比
const MAX_STEPS_PER_FRAME = 32
const STATS_INTERVAL = 0.2 // 数値の表示を更新する間隔 [s]
const GRAB_RADIUS_PX = 22 // 質点をつかめる範囲(タッチの的 44 px)
const KICK = 0.8 // 矢印キー 1 回で足す速さ [m/s]
const WIND_ARROW_Y = [2.3, 1.7, 1.1] // 風の矢印を描く高さ [m]
const WIND_ARROW_PER_MS = 0.12 // 風の矢印の長さ [m] / (m/s)

const viewOf = (width, height) => makeView({ width, height, xRange: [0, WORLD_W], yRange: [0, WORLD_H] })
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function ClothSim() {
  const [method, setMethod] = useState('springs')
  const [pin, setPin] = useState('edge')
  const [k, setK] = useState(300)
  const [kd, setKd] = useState(0.5)
  const [dtSprings, setDtSprings] = useState(4) // [ms]
  const [dtPbd, setDtPbd] = useState(16) // [ms]
  const [iterations, setIterations] = useState(6)
  const [windSpeed, setWindSpeed] = useState(0)
  const [drag, setDrag] = useState(1)
  const [lift, setLift] = useState(0)
  const [announce, setAnnounce] = useState('')

  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = createClothWorld({ pin: 'edge', k: 300, kd: 0.5 })
  const legend = useRef(null)
  const dtMs = method === 'springs' ? dtSprings : dtPbd
  const params = useRef({})
  params.current = { method, k, kd, iterations, windSpeed, CD: drag, CL: lift, dt: dtMs / 1000 }
  const clock = useRef({ acc: 0, t: 0, stats: 0 })

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const view = viewOf(width, height)
    const { windSpeed: wind } = params.current

    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    drawGravityLegend(ctx, view, GRAVITY, { colors })

    // 風(左から右へ。矢印の長さが風の速さ)
    if (wind > 0) {
      for (const y of WIND_ARROW_Y) {
        drawArrow(ctx, view, 0.08, y, 0.08 + WIND_ARROW_PER_MS * wind, y, { color: colors.muted, width: 1.8, head: 8 })
      }
    }
    // 風の文字は、絵の左上の角に置く(網の上の空き。狭い画面では網の左端が近く、矢印のすぐ上だと質点に重なる)
    drawText(ctx, wind > 0 ? `風 U = ${wind.toFixed(1)} m/s` : '風 なし', view.frame.left + 8, view.frame.top + 8, {
      color: colors.ink,
      size: 12,
      mono: true,
      baseline: 'top',
    })

    drawNet(ctx, view, world, colors)
    if (world.diverged) {
      const text = params.current.method === 'springs' ? '計算が発散しました（Δt が大きすぎる）。リセットで戻せます' : '計算が発散しました。リセットで戻せます'
      drawDivergedNotice(ctx, width, height, colors, text)
    }
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  // 凡例の、毎フレームは変わらない数(最大の伸び)
  const publishStats = useCallback(() => {
    const world = worldRef.current
    legend.current?.update({ stretch: world.diverged ? '発散' : `${(maxStretch(world) * 100).toFixed(1)} %` })
  }, [])

  const loop = useSimLoop(
    (frameDt) => {
      const world = worldRef.current
      const c = clock.current
      runSteps(c, frameDt, params.current.dt, MAX_STEPS_PER_FRAME, (dt) => stepCloth(world, params.current, dt))
      legend.current?.update({ t: fmtTime(c.t) })
      redraw()
      c.stats += frameDt
      if (c.stats >= STATS_INTERVAL) {
        c.stats = 0
        publishStats()
      }
    },
    { targetRef: canvasRef },
  )

  // 操作に合わせて、止まっているあいだも描き直す
  useEffect(() => {
    applyPins(worldRef.current, pin)
    publishStats()
    redraw()
  }, [pin, publishStats, redraw])

  useEffect(() => {
    if (worldRef.current.diverged) resetCloth(worldRef.current) // 崩れた状態は別の方式に引き継げない
    publishStats()
    redraw()
  }, [method, publishStats, redraw])

  useEffect(() => {
    redraw() // 風の矢印
  }, [windSpeed, redraw])

  const toWorld = (x, y) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    return { wx: clamp(view.wx(x), 0, WORLD_W), wy: clamp(view.wy(y), 0, WORLD_H), scale: view.scaleX }
  }
  // つかめる質点の上か(固定した質点と、発散したあとはつかめない)。usePointerDrag が canGrab で cursor を grab / grabbing に変える
  const overNode = ({ x, y }) => {
    const world = worldRef.current
    if (world.diverged) return false
    const { wx, wy, scale } = toWorld(x, y)
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

  usePointerDrag(canvasRef, {
    canGrab: overNode,
    onDown: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      if (worldRef.current.diverged || !grabNode(worldRef.current, wx, wy, GRAB_RADIUS_PX / scale)) return false
      if (!loop.running) {
        snapGrab(worldRef.current)
        redraw()
      }
    },
    onMove: ({ x, y }) => {
      const { wx, wy } = toWorld(x, y)
      moveGrab(worldRef.current, wx, wy)
      if (!loop.running) {
        snapGrab(worldRef.current)
        redraw()
      }
    },
    onUp: () => {
      releaseGrab(worldRef.current)
      redraw()
    },
  })

  // 矢印キー: 網全体を横や上下に弾く(ドラッグできない人の代わり)。止まっているときは動かし始める
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
    legend.current?.update({ t: fmtTime(0) })
    publishStats()
    redraw()
  }

  const ms = (s) => `${(s * 1000).toFixed(1)} ms`
  const netLimit = latticeStableDt(k, kd)
  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: fmtTime(clock.current.t), minChars: 7 },
    {
      key: 'dt',
      symbol: '\\Delta t',
      label: '時間刻み',
      value: method === 'springs' ? `${dtMs} ms` : `${dtMs} ms（位置の補正を ${iterations} 回くり返す）`,
    },
    { key: 'g', symbol: 'g', label: '重力', value: `${GRAVITY.toFixed(1)} m/s² ↓` },
    { key: 'wind', symbol: 'U', label: '風', value: windSpeed > 0 ? `${windSpeed.toFixed(1)} m/s →` : 'なし' },
    ...(method === 'springs'
      ? [
          { key: 'limit1', label: '安定の限界 2√(m/k)（ばね 1 本）', value: ms(stableDt(k)) },
          { key: 'limitNet', label: 'この網の限界（目安）', value: `${ms(netLimit)}${dtMs / 1000 > netLimit ? '：Δt が超えている' : ''}` },
        ]
      : []),
    { key: 'stretch', label: '最大の伸び', value: '0.0 %', minChars: 6 },
  ]

  const windIdle = windSpeed === 0
  return (
    <SimShell
      label="バネ-質点系と位置ベース法のシミュレーション"
      aspect={ASPECT}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="質点を辺でつないだ網が、上の辺から吊られて重力で垂れ下がる。風が左から吹く。網の質点はドラッグでつかめる。矢印キーで網全体を弾ける"
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
            <ModeSwitch
              label="計算の方式"
              value={method}
              onChange={setMethod}
              options={[
                { value: 'springs', label: 'バネ-質点系' },
                { value: 'pbd', label: '位置ベース法' },
              ]}
            />
            <ModeSwitch
              variant="quiet"
              label="固定する所"
              value={pin}
              onChange={setPin}
              options={[
                { value: 'edge', label: '上の辺' },
                { value: 'corners', label: '上の両端' },
              ]}
            />
          </SimToolbar>
          {method === 'springs' ? (
            <>
              <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={50} max={1500} step={10} onChange={setK} />
              <ParamSlider symbol="k_d" label="減衰係数" unit="N·s/m" value={kd} min={0} max={2} step={0.1} onChange={setKd} format={(v) => v.toFixed(1)} />
              <ParamSlider symbol="\Delta t" label="時間刻み" unit="ms" value={dtSprings} min={1} max={20} step={1} onChange={setDtSprings} />
            </>
          ) : (
            <>
              <ParamSlider symbol="n" label="反復の回数" unit="回" value={iterations} min={4} max={30} step={1} onChange={setIterations} />
              <ParamSlider symbol="\Delta t" label="時間刻み" unit="ms" value={dtPbd} min={1} max={16} step={1} onChange={setDtPbd} />
            </>
          )}
          {/* 抗力・揚力の係数は風があるときだけ。風 0 のまま、動かしても何も変わない操作を残さない */}
          <ControlGroup label="風">
            <ParamSlider symbol="U" label="風の速さ" unit="m/s" value={windSpeed} min={0} max={5} step={0.5} onChange={setWindSpeed} format={(v) => v.toFixed(1)} />
            {!windIdle && (
              <>
                <ParamSlider symbol="C_D" label="抗力係数" value={drag} min={0} max={1.5} step={0.1} onChange={setDrag} format={(v) => v.toFixed(1)} />
                <ParamSlider symbol="C_L" label="揚力係数" value={lift} min={-1} max={1} step={0.1} onChange={setLift} format={(v) => v.toFixed(1)} />
              </>
            )}
          </ControlGroup>
        </>
      }
    />
  )
}
