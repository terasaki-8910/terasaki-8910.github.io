import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import {
  TANKS,
  ASPECTS,
  NARROW_QUERY,
  DEFAULTS,
  SPEED_FULL,
  DENSITY_LOW,
  DENSITY_HIGH,
  makeSim,
  resetSim,
  syncParams,
  advanceSim,
  legendValues,
  insideTank,
  pointerDown,
  pointerMove,
  pointerUp,
  pointerHover,
  drawFluid,
  FAST_COLOR,
} from './fluidCore.js'

// 節「流体(SPH)」の全体のシミュレーション: 2 次元のダムの決壊。ドラッグで近くの粒子を押せる。
// 状態・計算の進め方・描画は fluidCore.js(React に依存しない)。ここは操作と canvas・ループをつなぐ。
// 凡例(絵の下 SimLegend): 時刻 t(毎フレーム書き換え)、Δt×1 フレームのステップ数、重力 g、粒子の色の意味、粒子の数と h、
// 近傍探索で距離を調べた組(総当たりとの比較)、実時間に対する進み。軸と目盛り(x・y [m])と g の矢印は canvas に描く(drawFluid)。

function isNarrow() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(NARROW_QUERY).matches
}

export default function FluidSim() {
  const [g, setG] = useState(DEFAULTS.g) // 重力の大きさ [m/s²]
  const [k, setK] = useState(DEFAULTS.k) // 圧力の係数 [m²/s²]
  const [mu, setMu] = useState(DEFAULTS.mu) // 粘性 [kg/s]
  const [rho0, setRho0] = useState(DEFAULTS.rho0) // 休止密度 [kg/m²]
  const [colorMode, setColorMode] = useState('speed')
  const [showGrid, setShowGrid] = useState(false)
  const [narrow, setNarrow] = useState(isNarrow)

  const p = { g, k, mu, rho0, colorMode, showGrid }
  const paramsRef = useRef(p)
  paramsRef.current = p
  const tankKey = narrow ? 'narrow' : 'wide'
  const sim = useRef(null)
  if (sim.current === null) sim.current = makeSim(tankKey, p)
  const cacheRef = useRef({ colors: null, palette: [], gridLine: '', cell: '' })
  const legend = useRef(null)

  const writeLegend = useCallback(() => {
    legend.current?.update(legendValues(sim.current))
  }, [])

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawFluid(ctx, width, height, colors, sim.current, paramsRef.current, cacheRef.current)
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const s = sim.current
      syncParams(s, paramsRef.current)
      if (dt > 0) advanceSim(s, dt)
      s.acc += dt
      legend.current?.update({ t: `${s.time.toFixed(2)} s` })
      if (s.acc >= 0.25) {
        s.acc = 0
        writeLegend()
      }
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 画面の幅が 640px をまたいだら、水槽と粒子の数を替えて最初からやり直す
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY)
    if (!query) return undefined
    const onChange = (event) => setNarrow(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  useLayoutEffect(() => {
    if (sim.current.tankKey === tankKey) return
    sim.current = makeSim(tankKey, paramsRef.current)
    writeLegend()
    redraw()
  }, [tankKey, redraw, writeLegend])

  // 止まっているあいだも、表示にかかわる設定を変えたら描き直す
  useEffect(() => {
    redraw()
  }, [colorMode, showGrid, rho0, g, redraw])
  useEffect(() => {
    writeLegend()
  }, [writeLegend])

  // 止まっているときは、ポインタを動かしたら自分で描き直す(動いているときはループが描く)
  const repaint = () => {
    if (!loop.active) redraw()
  }

  // 水槽の中ならどこでも押せる(軸の余白では押せない)。usePointerDrag が cursor を grab / grabbing にする
  const inTank = ({ x, y }) => {
    const { width, height } = sizeRef.current
    return insideTank(sim.current, x, y, width, height)
  }

  usePointerDrag(canvasRef, {
    canGrab: inTank,
    onDown: ({ x, y }) => {
      if (!inTank({ x, y })) return false
      const { width, height } = sizeRef.current
      pointerDown(sim.current, x, y, width, height)
      repaint()
    },
    onMove: ({ x, y, vx, vy }) => {
      const { width, height } = sizeRef.current
      pointerMove(sim.current, x, y, vx, vy, width, height)
      repaint()
    },
    onUp: ({ event }) => {
      pointerUp(sim.current, event.pointerType === 'mouse') // マウスは離したあとも、上にいる間は近傍を見せる
      repaint()
    },
    onHover: ({ x, y }) => {
      const { width, height } = sizeRef.current
      pointerHover(sim.current, x, y, width, height)
      if (paramsRef.current.showGrid) repaint()
    },
  })

  // ポインタが canvas を出たら、近傍の表示を消す
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const onLeave = () => {
      sim.current.probe.on = false
      redraw()
    }
    canvas.addEventListener('pointerleave', onLeave)
    return () => canvas.removeEventListener('pointerleave', onLeave)
  }, [canvasRef, redraw])

  function reset() {
    resetSim(sim.current, paramsRef.current)
    writeLegend()
    redraw()
  }

  const speedMode = colorMode === 'speed'
  const tank = TANKS[tankKey]
  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: `${sim.current.time.toFixed(2)} s`, minChars: 7 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: '', minChars: 25 },
    { key: 'g', symbol: 'g', label: '重力', value: `${g.toFixed(1)} m/s² ↓` },
    {
      key: 'color',
      label: speedMode ? '粒子の色（速さ）' : '粒子の色（密度 ρ/ρ0）',
      value: speedMode ? `0 → ${SPEED_FULL} m/s 以上` : `${DENSITY_LOW} → ${DENSITY_HIGH} 以上`,
      swatch: `linear-gradient(to right, var(--color-ink), var(--${FAST_COLOR}))`,
    },
    { key: 'n', symbol: 'N', label: '粒子の数', value: '', minChars: 18 },
    { key: 'pairs', label: '距離を調べた候補', value: '', minChars: 24 },
    { key: 'speed', label: '進み', value: '', minChars: 22 },
  ]

  return (
    <SimShell
      label="粒子法の流体（SPH）：ダムの決壊"
      aspect={ASPECTS[tankKey]}
      stage={
        <SimCanvas
          ref={canvasRef}
          label="水を表す粒子の集まり。左に積んだ水の塊が崩れて、水槽の中を広がる。ドラッグすると近くの粒子を押せる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ModeSwitch
              label="粒子の色"
              value={colorMode}
              onChange={setColorMode}
              options={[
                { value: 'speed', label: '速さ' },
                { value: 'density', label: '密度' },
              ]}
            />
            <ToggleButton pressed={showGrid} onChange={setShowGrid}>
              グリッド
            </ToggleButton>
          </SimToolbar>
          <ParamSlider symbol="g" label="重力" unit="m/s²" value={g} min={0} max={20} step={0.1} onChange={setG} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="k" label="圧力の係数" unit="m²/s²" value={k} min={40} max={150} step={5} onChange={setK} />
          <ParamSlider symbol="\mu" label="粘性" unit="kg/s" value={mu} min={5} max={30} step={1} onChange={setMu} />
          <ParamSlider symbol="\rho_0" label="休止密度" unit="kg/m²" value={rho0} min={900} max={1100} step={1} onChange={setRho0} />
        </>
      }
    />
  )
}
