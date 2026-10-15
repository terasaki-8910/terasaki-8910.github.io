import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import {
  WORLD_W,
  WORLD_H,
  createClothWorld,
  resetCloth,
  applyPins,
  isPinned,
  stepCloth,
  grabNode,
  moveGrab,
  snapGrab,
  releaseGrab,
  stableDt,
  latticeStableDt,
  maxStretch,
} from './clothWorld'

// 節「バネ-質点系と位置ベース法」のシミュレーション。2 次元の網を、質点-ばね系(半陰的オイラー法)と
// 位置ベース法のどちらでも進められる。切り替えても同じ質点の状態(位置・速度)を引き継ぐ。
// 計算は clothWorld.js(massSpring.js・pbd.js の関数を呼ぶ)、ここは画面と操作。
const ASPECT = WORLD_W / WORLD_H
const MAX_STEPS_PER_FRAME = 32
const STATS_INTERVAL = 0.2 // 数値の表示を更新する間隔 [s]
const GRAB_RADIUS_PX = 22 // 質点をつかめる範囲(タッチの的 44 px)
const STRETCH_HIGHLIGHT = 0.1 // 自然長より 10 % 以上伸びた辺は色を変える

const WIND_ARROW_Y = [2.3, 1.7, 1.1] // 風の矢印を描く高さ [m]

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
  const [info, setInfo] = useState({ stretch: 0, diverged: false })

  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = createClothWorld({ pin: 'edge', k: 300, kd: 0.5 })
  const dtMs = method === 'springs' ? dtSprings : dtPbd
  const params = useRef({})
  params.current = { method, k, kd, iterations, windSpeed, CD: drag, CL: lift, dt: dtMs / 1000 }
  const clock = useRef({ acc: 0, stats: 0 })
  const cursor = useRef('')

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const world = worldRef.current
    const { pos } = world.state
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    const px = (i) => pos[2 * i] * scale
    const py = (i) => height - pos[2 * i + 1] * scale
    const segs = world.segments

    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 風(左から右へ)
    const { windSpeed: wind, method: m } = params.current
    if (wind > 0) {
      const len = 6 * wind
      ctx.strokeStyle = colors.muted
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let a = 0; a < WIND_ARROW_Y.length; a++) {
        const y = WIND_ARROW_Y[a]
        const ay = height - y * scale
        ctx.moveTo(8, ay)
        ctx.lineTo(8 + len, ay)
        ctx.moveTo(8 + len - 6, ay - 4)
        ctx.lineTo(8 + len, ay)
        ctx.lineTo(8 + len - 6, ay + 4)
      }
      ctx.stroke()
    }

    // 辺。伸びた辺は別の色で太く(二度に分けて引く)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = colors.alpha('ink', 0.75)
    ctx.beginPath()
    for (let s = 0; s < segs.length; s++) {
      const { i, j, d } = segs[s]
      const dx = pos[2 * j] - pos[2 * i]
      const dy = pos[2 * j + 1] - pos[2 * i + 1]
      if (Math.sqrt(dx * dx + dy * dy) > d * (1 + STRETCH_HIGHLIGHT)) continue
      ctx.moveTo(px(i), py(i))
      ctx.lineTo(px(j), py(j))
    }
    ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = colors.alpha('diff-delete', 1) // 伸びすぎの警告の色(地に 4.7:1 以上。accent は 1.6:1 で見えない)
    ctx.beginPath()
    for (let s = 0; s < segs.length; s++) {
      const { i, j, d } = segs[s]
      const dx = pos[2 * j] - pos[2 * i]
      const dy = pos[2 * j + 1] - pos[2 * i + 1]
      if (!(Math.sqrt(dx * dx + dy * dy) > d * (1 + STRETCH_HIGHLIGHT))) continue
      ctx.moveTo(px(i), py(i))
      ctx.lineTo(px(j), py(j))
    }
    ctx.stroke()

    // 質点。固定した質点は四角、つかんでいる質点は大きな丸
    ctx.fillStyle = colors.ink
    const n = world.state.n
    for (let i = 0; i < n; i++) {
      if (i === world.grab.index) continue
      if (isPinned(world, i)) ctx.fillRect(px(i) - 3.5, py(i) - 3.5, 7, 7)
      else ctx.fillRect(px(i) - 1.5, py(i) - 1.5, 3, 3)
    }
    if (world.grab.index >= 0) {
      const g = world.grab.index
      ctx.fillStyle = colors.accent
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px(g), py(g), 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    if (world.diverged) {
      const text = m === 'springs' ? '計算が発散しました（Δt が大きすぎる）。リセットで戻せます' : '計算が発散しました。リセットで戻せます'
      ctx.font = '600 14px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const w = ctx.measureText(text).width + 28
      ctx.fillStyle = colors.surface
      ctx.fillRect((width - w) / 2, height / 2 - 20, w, 40)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.strokeRect((width - w) / 2, height / 2 - 20, w, 40)
      ctx.fillStyle = colors.ink
      ctx.fillText(text, width / 2, height / 2)
    }
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  // 表示する数値。変わったときだけ state にする
  const publishInfo = useCallback(() => {
    const world = worldRef.current
    const stretch = world.diverged ? 0 : Math.round(maxStretch(world) * 1000) / 10 // 0.1 % 単位
    setInfo((prev) => (prev.stretch === stretch && prev.diverged === world.diverged ? prev : { stretch, diverged: world.diverged }))
  }, [])

  const loop = useSimLoop(
    (frameDt) => {
      const world = worldRef.current
      const c = clock.current
      const dt = params.current.dt
      c.acc += frameDt
      let steps = 0
      while (c.acc >= dt - 1e-4 && steps < MAX_STEPS_PER_FRAME) {
        stepCloth(world, params.current, dt)
        c.acc -= dt
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) c.acc = 0 // 追いつけないぶんは捨てる
      redraw()
      c.stats += frameDt
      if (c.stats >= STATS_INTERVAL) {
        c.stats = 0
        publishInfo()
      }
    },
    { targetRef: canvasRef },
  )

  // 操作に合わせて、止まっているあいだも描き直す
  useEffect(() => {
    applyPins(worldRef.current, pin)
    publishInfo()
    redraw()
  }, [pin, publishInfo, redraw])

  useEffect(() => {
    if (worldRef.current.diverged) resetCloth(worldRef.current) // 崩れた状態は別の方式に引き継げない
    publishInfo()
    redraw()
  }, [method, publishInfo, redraw])

  useEffect(() => {
    redraw() // 風の矢印
  }, [windSpeed, redraw])

  const toWorld = (x, y) => {
    const { width, height } = sizeRef.current
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    return { wx: clamp(x / scale, 0, WORLD_W), wy: clamp((height - y) / scale, 0, WORLD_H), scale }
  }
  const setCursor = (value) => {
    if (cursor.current === value) return
    cursor.current = value
    if (canvasRef.current) canvasRef.current.style.cursor = value
  }

  usePointerDrag(canvasRef, {
    onDown: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      if (worldRef.current.diverged || !grabNode(worldRef.current, wx, wy, GRAB_RADIUS_PX / scale)) return false
      setCursor('grabbing')
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
      setCursor('')
      redraw()
    },
    onHover: ({ x, y }) => {
      const world = worldRef.current
      if (world.diverged) return
      const { wx, wy, scale } = toWorld(x, y)
      const reach = GRAB_RADIUS_PX / scale
      const { pos } = world.state
      let over = false
      for (let i = 0; i < world.state.n && !over; i++) {
        if (isPinned(world, i)) continue
        const dx = wx - pos[2 * i]
        const dy = wy - pos[2 * i + 1]
        over = dx * dx + dy * dy <= reach * reach
      }
      setCursor(over ? 'grab' : '')
    },
  })

  function reset() {
    resetCloth(worldRef.current)
    clock.current.acc = 0
    publishInfo()
    redraw()
  }

  const ms = (s) => (s * 1000).toFixed(1)
  const netLimit = latticeStableDt(k, kd)
  const readout = (
    <>
      {method === 'springs' ? (
        <div>
          <span style={{ marginRight: '1.5em', whiteSpace: 'nowrap' }}>Δt = {dtMs} ms</span>
          <span style={{ marginRight: '1.5em', whiteSpace: 'nowrap' }}>安定の限界 2√(m/k) = {ms(stableDt(k))} ms（ばね 1 本）</span>
          <span style={{ whiteSpace: 'nowrap' }}>
            この網では {ms(netLimit)} ms（目安）{dtMs / 1000 > netLimit ? '：Δt が超えている' : ''}
          </span>
        </div>
      ) : (
        <div>
          <span style={{ marginRight: '1.5em', whiteSpace: 'nowrap' }}>Δt = {dtMs} ms</span>
          <span style={{ whiteSpace: 'nowrap' }}>反復 {iterations} 回</span>
        </div>
      )}
      <div>{info.diverged ? '計算が発散' : `最大の伸び ${info.stretch.toFixed(1)} %`}</div>
    </>
  )

  const windIdle = windSpeed === 0
  return (
    <SimShell
      label="バネ-質点系と位置ベース法のシミュレーション"
      aspect={ASPECT}
      stage={
        <SimCanvas
          ref={canvasRef}
          label="質点を辺でつないだ網が、上の辺から吊られて重力で垂れ下がる。風が左から吹く。網の質点はドラッグでつかめる"
        />
      }
      readout={readout}
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
          <ParamSlider symbol="U" label="風の速さ" unit="m/s" value={windSpeed} min={0} max={5} step={0.5} onChange={setWindSpeed} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="C_D" label="抗力係数" value={drag} min={0} max={1.5} step={0.1} onChange={setDrag} disabled={windIdle} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="C_L" label="揚力係数" value={lift} min={-1} max={1} step={0.1} onChange={setLift} disabled={windIdle} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
