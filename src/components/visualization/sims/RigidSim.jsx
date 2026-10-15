import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
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
const ASPECT = WORLD_W / WORLD_H
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
  const [stats, setStats] = useState(() => ({ ...worldRef.current.stats }))
  const params = useRef({})
  params.current = { gravity, e: restitution, substeps, showBroad }
  const clock = useRef({ acc: 0, stats: 0 })
  const cursor = useRef('')

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    const { showBroad: broad } = params.current
    const px = (x) => x * scale
    const py = (y) => height - y * scale

    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    if (broad) {
      // AABB
      ctx.strokeStyle = colors.alpha('ink', 0.4)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < world.n; i++) {
        const b = world.boxes[i]
        ctx.rect(px(b.min[0]), py(b.max[1]), px(b.max[0] - b.min[0]), px(b.max[1] - b.min[1]))
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
      ctx.arc(px(b.c[0]), py(b.c[1]), px(b.r), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (world.grab.index >= 0) {
      const b = world.circles[world.grab.index]
      ctx.fillStyle = colors.accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(px(b.c[0]), py(b.c[1]), px(b.r), 0, Math.PI * 2)
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

  // 表示する数値。変わったときだけ state にして、描き直しの外で再描画を起こさない
  const publishStats = useCallback(() => {
    const s = worldRef.current.stats
    setStats((prev) =>
      prev.total === s.total && prev.candidates === s.candidates && prev.contacts === s.contacts
        ? prev
        : { total: s.total, candidates: s.candidates, contacts: s.contacts },
    )
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
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) c.acc = 0 // 追いつけないぶんは捨てる
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

  const toWorld = (x, y) => {
    const { width, height } = sizeRef.current
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    return { wx: x / scale, wy: (height - y) / scale, scale }
  }
  const setCursor = (value) => {
    if (cursor.current === value) return
    cursor.current = value
    if (canvasRef.current) canvasRef.current.style.cursor = value
  }

  usePointerDrag(canvasRef, {
    onDown: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      if (!grabAt(worldRef.current, wx, wy, GRAB_SLOP_PX / scale)) return false
      setCursor('grabbing')
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
      setCursor('')
      if (!loop.running) refresh()
    },
    onHover: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      const world = worldRef.current
      let over = false
      for (let i = 0; i < world.n && !over; i++) {
        const b = world.circles[i]
        const dx = wx - b.c[0]
        const dy = wy - b.c[1]
        const reach = b.r + GRAB_SLOP_PX / scale
        over = dx * dx + dy * dy <= reach * reach
      }
      setCursor(over ? 'grab' : '')
    },
  })

  function reset() {
    resetWorld(worldRef.current)
    clock.current.acc = 0
    refresh()
  }

  const readout = (
    <>
      <div>
        <span style={{ marginRight: '1.5em', whiteSpace: 'nowrap' }}>総当たりの組 N(N−1)/2 = {stats.total}</span>
        <span style={{ marginRight: '1.5em', whiteSpace: 'nowrap' }}>候補 {stats.candidates}</span>
        <span style={{ whiteSpace: 'nowrap' }}>衝突 {stats.contacts}</span>
      </div>
      <div>
        Δt = 1/60 s を {substeps} 等分（{((1000 / 60) / substeps).toFixed(2)} ms ずつ）
      </div>
    </>
  )

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
      readout={readout}
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
