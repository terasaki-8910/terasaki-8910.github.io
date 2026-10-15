import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes } from '../axes'
import {
  WORLD_W,
  WORLD_H,
  MAX_CIRCLES,
  createRigidWorld,
  setCount as setCircleCount,
  resetWorld,
  stepWorld,
  detectContacts,
  grabAt,
  moveGrab,
  snapGrab,
  releaseGrab,
} from './rigidWorld'

// 節「剛体と衝突」のシミュレーション。箱の中の円が落ちて、壁と円どうしで衝突する。
// 時間は固定の Δt = 1/60 s ずつ進め、1 回の Δt をサブステップに分けて計算する。
// 計算は rigidWorld.js(collide.js・integrate.js の関数を呼ぶ)、ここは画面と操作。
//
// 全体のシミュレーションの「手本」: 軸・目盛り(axes.js の makeView と drawAxes)、凡例(SimLegend)、
// つかむカーソル(usePointerDrag の canGrab)の使い方は、ここを見る。
//   - 世界(4 m × 3 m、y が上向き)は makeView で canvas の余白の内側に収める。描くときは view.sx・view.sy・view.scaleX、
//     ポインタは view.wx・view.wy で世界の座標に戻す。
//   - 凡例の値のうち、毎フレーム変わるもの(時刻 t、数)は legend.current.update で文字だけ書き換える。
//     スライダーで変わるもの(Δt、g、e)は items の value に書く。
const ASPECT = 1.27 // 4 m × 3 m の枠に軸の余白(左右 56px、上下 66px)を足した縦横比。幅 600px 前後で余りが出ない
const formatTime = (t) => `${t.toFixed(2)} s`
const WORLD_X = [0, WORLD_W]
const WORLD_Y = [0, WORLD_H]
const viewOf = (width, height) => makeView({ width, height, xRange: WORLD_X, yRange: WORLD_Y })
const FIXED_DT = 1 / 60
const MAX_STEPS_PER_FRAME = 3
const STATS_INTERVAL = 0.2 // 数値の表示を更新する間隔 [s]
const GRAB_SLOP_PX = 10 // 円の外側でも、このくらいまでならつかめる(指で触れやすいように)

export default function RigidSim() {
  const [count, setCount] = useState(24)
  const [gravity, setGravity] = useState(9.8)
  const [restitution, setRestitution] = useState(0.6)
  const [substeps, setSubsteps] = useState(8)
  const [showBroad, setShowBroad] = useState(false)

  const worldRef = useRef(null)
  if (!worldRef.current) {
    worldRef.current = createRigidWorld(24)
    detectContacts(worldRef.current, 0, false) // 最初の数値を出すために、一度だけ数える
  }
  const legend = useRef(null)
  const params = useRef({})
  params.current = { gravity, e: restitution, substeps, showBroad }
  const clock = useRef({ acc: 0, stats: 0, t: 0 })

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const view = viewOf(width, height)
    const scale = view.scaleX
    const { showBroad: broad } = params.current
    const px = view.sx
    const py = view.sy

    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 箱の中(壁)と、軸・目盛り
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1.5
    ctx.strokeRect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })

    if (broad) {
      // AABB
      ctx.strokeStyle = colors.alpha('ink', 0.6) // 地に 3:1 以上(0.4 だと 2.4:1)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < world.n; i++) {
        const b = world.boxes[i]
        ctx.rect(px(b.min[0]), py(b.max[1]), (b.max[0] - b.min[0]) * scale, (b.max[1] - b.min[1]) * scale)
      }
      ctx.stroke()
    }

    // 円
    ctx.lineWidth = 1.5
    ctx.strokeStyle = colors.ink
    ctx.fillStyle = colors.alpha('accent', 0.6)
    for (let i = 0; i < world.n; i++) {
      const b = world.circles[i]
      if (i === world.grab.index) continue
      ctx.beginPath()
      ctx.arc(px(b.c[0]), py(b.c[1]), b.r * scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (world.grab.index >= 0) {
      const b = world.circles[world.grab.index]
      ctx.fillStyle = colors.accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(px(b.c[0]), py(b.c[1]), b.r * scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    if (broad) {
      // 候補の組(Sweep and Prune)を細い線で、その中で実際に重なっている組を太い線で
      const { pairs, hit, circles } = world
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = 0; k < pairs.length; k++) {
        if (hit[k]) continue
        const a = circles[pairs[k][0]].c
        const b = circles[pairs[k][1]].c
        ctx.moveTo(px(a[0]), py(a[1]))
        ctx.lineTo(px(b[0]), py(b[1]))
      }
      ctx.stroke()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let k = 0; k < pairs.length; k++) {
        if (!hit[k]) continue
        const a = circles[pairs[k][0]].c
        const b = circles[pairs[k][1]].c
        ctx.moveTo(px(a[0]), py(a[1]))
        ctx.lineTo(px(b[0]), py(b[1]))
      }
      ctx.stroke()
    }
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  // 凡例の、毎フレームは変わらない数(組の数)。文字だけ書き換えるので、React は描き直さない
  const publishStats = useCallback(() => {
    const st = worldRef.current.stats
    legend.current?.update({ total: `${st.total} 組`, candidates: `${st.candidates} 組`, contacts: `${st.contacts} 組` })
  }, [])

  const loop = useSimLoop(
    (dt) => {
      const c = clock.current
      const world = worldRef.current
      c.acc += dt
      let steps = 0
      while (c.acc >= FIXED_DT - 0.0015 && steps < MAX_STEPS_PER_FRAME) {
        stepWorld(world, params.current, FIXED_DT)
        c.acc -= FIXED_DT
        c.t += FIXED_DT
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) c.acc = 0 // 追いつけないぶんは捨てる
      legend.current?.update({ t: formatTime(c.t) })
      redraw()
      c.stats += dt
      if (c.stats >= STATS_INTERVAL) {
        c.stats = 0
        publishStats()
      }
    },
    { targetRef: canvasRef },
  )

  // 止まっているあいだも、操作に合わせて判定をやり直して描く
  const refresh = useCallback(() => {
    detectContacts(worldRef.current, params.current.e, false)
    publishStats()
    redraw()
  }, [publishStats, redraw])

  useEffect(() => {
    setCircleCount(worldRef.current, count)
    refresh()
  }, [count, refresh])

  useEffect(() => {
    refresh()
  }, [showBroad, refresh])

  // 画面の座標 → 世界の座標(view.wx・view.wy)。scale は世界の 1 m あたりの px
  const toWorld = (x, y) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    return { wx: view.wx(x), wy: view.wy(y), scale: view.scaleX }
  }

  // つかめる円の上か(onDown の当たり判定と同じ。円の外側 GRAB_SLOP_PX までつかめる)。
  // usePointerDrag が canGrab で cursor を grab / grabbing に変える
  const overCircle = ({ x, y }) => {
    const { wx, wy, scale } = toWorld(x, y)
    const world = worldRef.current
    for (let i = 0; i < world.n; i++) {
      const b = world.circles[i]
      const dx = wx - b.c[0]
      const dy = wy - b.c[1]
      const reach = b.r + GRAB_SLOP_PX / scale
      if (dx * dx + dy * dy <= reach * reach) return true
    }
    return false
  }

  usePointerDrag(canvasRef, {
    canGrab: overCircle,
    onDown: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      if (!grabAt(worldRef.current, wx, wy, GRAB_SLOP_PX / scale)) return false
      if (!loop.running) {
        snapGrab(worldRef.current)
        refresh()
      }
    },
    onMove: ({ x, y }) => {
      const { wx, wy } = toWorld(x, y)
      moveGrab(worldRef.current, wx, wy)
      if (!loop.running) {
        snapGrab(worldRef.current)
        refresh()
      }
    },
    onUp: ({ vx, vy }) => {
      const { scale } = toWorld(0, 0)
      releaseGrab(worldRef.current, vx / scale, -vy / scale) // 画面は下向きが正なので y を反転する
      if (!loop.running) refresh()
    },
  })

  function reset() {
    resetWorld(worldRef.current)
    clock.current.acc = 0
    clock.current.t = 0
    legend.current?.update({ t: formatTime(0) })
    refresh()
  }

  // 凡例。軸の単位は canvas の軸の名前(x [m]・y [m])、時刻と刻み、重力と反発係数、組の数。
  // t と組の数は毎フレーム(0.2 秒ごと)書き換える値で、ここの初期値は最初の 1 回だけ使われる。
  // Δt・g・e は、スライダーが変わるたびに items が変わって書き直される
  const st = worldRef.current.stats
  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: formatTime(clock.current.t), minChars: 8 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${(1000 / 60 / substeps).toFixed(2)} ms × ${substeps} 回（1/60 s）` },
    { key: 'g', symbol: 'g', label: '重力', value: `${gravity.toFixed(1)} m/s² ↓` },
    { key: 'e', symbol: 'e', label: '反発係数', value: restitution.toFixed(2) },
    { key: 'total', label: '総当たり N(N−1)/2', value: `${st.total} 組`, minChars: 5 },
    { key: 'candidates', label: '候補', value: `${st.candidates} 組`, minChars: 4 },
    { key: 'contacts', label: '衝突', value: `${st.contacts} 組`, minChars: 4 },
  ]

  return (
    <SimShell
      label="剛体と衝突のシミュレーション"
      aspect={ASPECT}
      stage={
        <SimCanvas
          ref={canvasRef}
          label="箱の中で円が落ちて、壁や円どうしで衝突する。円はドラッグでつかんで投げられる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ToggleButton pressed={showBroad} onChange={setShowBroad}>
              広域の判定を表示
            </ToggleButton>
          </SimToolbar>
          <ParamSlider symbol="N" label="円の数" unit="個" value={count} min={5} max={MAX_CIRCLES} step={1} onChange={setCount} />
          <ParamSlider symbol="g" label="重力" unit="m/s²" value={gravity} min={0} max={20} step={0.1} onChange={setGravity} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="e" label="反発係数" value={restitution} min={0} max={1} step={0.05} onChange={setRestitution} format={(v) => v.toFixed(2)} />
          <ParamSlider symbol="n" label="サブステップの数" unit="回" value={substeps} min={1} max={16} step={1} onChange={setSubsteps} />
        </>
      }
    />
  )
}
