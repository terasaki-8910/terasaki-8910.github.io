import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useSimLoop from '../useSimLoop'
import { sphMaxDt } from '../../../utils/vis/sph.js'
import { rampColor, unit, fmt, splitPanels, drawSeries } from './fluidKit.js'
import { createPatch, layoutLattice, settle, advancePatch, maxSpeed, BASE } from './fluidPatch.js'
import { viewFor, drawBoard, drawParticles } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'

// 段階 7「時間の進め方」: ダムの決壊を、Δt を上限 Δt_max = 0.3·h/√k の何倍かで進める。上限以下(〜2 倍)なら静かに崩れ、
// 3 倍を超えると圧力の力が行き過ぎて粒子が暴れ(最大の速さが跳ね上がる)、さらに大きいと壊れる。
// 粒子の速さの打ち切り(vmax)は外してある(外さないと、暴れが隠れる)。右のグラフは最大の速さ。
// 計算は fluidPatch.js(utils/vis/sph.js の sphStep。速度を先に更新して、その新しい速度で位置を更新する半陰的オイラー法)。
const WORLD7 = { width: 0.5, height: 0.3 }
const COLS = 14
const ROWS = 10
const SPEED_FULL = 2.5
const ROUGH_SPEED = 4 // 最大の速さがこれを超えたら「荒れている」[m/s]
const RECENT = 0.3 // 荒れの判定に使う直近の時間 [s]
const WINDOW = 1.5
const MAX_POINTS = 900
const STACK = { stack: true } // 幅が足りないときは、グラフを絵の下に置く
const HEIGHT = { pc: [280, 360], phone: [400, 480] } // スマホは上下に並べるので高くする
const viewOf = (w, h) => {
  const { main } = splitPanels(w, h, STACK)
  return viewFor(WORLD7, main.width, main.height)
}

function makePatch(k) {
  return createPatch({ cols: COLS, rows: ROWS, ...WORLD7, params: { gravity: [0, -9.8], vmax: Infinity, k } })
}

export default function FluidStep7() {
  const [ratio, setRatio] = useState(1) // Δt ÷ Δt_max
  const [k, setK] = useState(BASE.k)
  const patchRef = useRef(null)
  if (patchRef.current === null) {
    patchRef.current = makePatch(BASE.k)
    layoutLattice(patchRef.current, patchRef.current.spacing, 'corner')
  }
  const hist = useRef({ t: [], v: [] })
  const info = useRef({ steps: 1, dt: sphMaxDt(BASE), broken: false })
  const legend = useRef(null)
  const live = useRef(null)
  const running = useRef(false)
  const ratioRef = useRef(ratio)
  ratioRef.current = ratio

  const status = () => {
    if (info.current.broken) return '壊れた'
    const h = hist.current
    const t1 = patchRef.current.time
    let peak = 0
    for (let q = h.t.length - 1; q >= 0 && h.t[q] >= t1 - RECENT; q--) peak = Math.max(peak, h.v[q])
    return peak > ROUGH_SPEED ? '荒れている' : '安定'
  }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const { state, params } = patch
    const { main, side } = splitPanels(width, height, STACK)
    const view = viewFor(WORLD7, main.width, main.height)
    drawBoard(ctx, view, colors, { width, height })
    const { vel } = state
    drawParticles(ctx, view, colors, patch, (i) => rampColor(colors, unit(Math.hypot(vel[2 * i], vel[2 * i + 1]), 0, SPEED_FULL)))
    if (side) {
      const h = hist.current
      const t1 = Math.max(WINDOW, patch.time)
      ctx.fillStyle = colors.surface
      ctx.fillRect(side.left, side.top, side.width, side.height)
      drawSeries(ctx, side, colors, {
        xRange: [t1 - WINDOW, t1],
        yRange: [0, 12],
        xLabel: 't [s]',
        yLabel: '最大の速さ [m/s]',
        curves: [{ pts: h.t.map((t, q) => [t, Math.min(h.v[q], 12)]), color: colors.alpha('lane-1', 1), width: 2.5 }],
        hlines: [{ y: ROUGH_SPEED, color: colors.muted, dash: [4, 4] }],
      })
    }
    const dtMax = sphMaxDt(params)
    legend.current?.update({
      t: `${patch.time.toFixed(2)} s`,
      dt: `${(info.current.dt * 1000).toFixed(2)} ms（上限の ${ratioRef.current.toFixed(2)} 倍）`,
      dtMax: `${(dtMax * 1000).toFixed(2)} ms`,
      steps: `${info.current.steps} 回/フレーム`,
      vmax: Number.isFinite(maxSpeed(patch)) ? `${maxSpeed(patch).toFixed(2)} m/s` : '–',
      status: status(),
    })
  }, [])

  const afterMove = () => {
    if (!running.current) settle(patchRef.current)
    redraw()
  }
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const { canvasRef, redraw, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved: afterMove, announce, keyStep: 0.006 })

  const loop = useSimLoop(
    (dt) => {
      const patch = patchRef.current
      if (info.current.broken) return
      info.current = { ...info.current, ...advancePatch(patch, dt, ratioRef.current) }
      const v = maxSpeed(patch)
      if (!Number.isFinite(v)) {
        info.current.broken = true
        loop.pause()
      } else {
        const h = hist.current
        h.t.push(patch.time)
        h.v.push(v)
        if (h.t.length > MAX_POINTS) {
          h.t.splice(0, h.t.length - MAX_POINTS)
          h.v.splice(0, h.v.length - MAX_POINTS)
        }
      }
      redraw()
    },
    { targetRef: canvasRef },
  )
  running.current = loop.running

  useEffect(() => {
    patchRef.current.params.k = k
    if (!running.current) settle(patchRef.current)
    redraw()
  }, [k, redraw])
  useEffect(() => {
    info.current.dt = sphMaxDt(patchRef.current.params) * ratio
    redraw()
  }, [ratio, k, redraw])

  function reset() {
    patchRef.current = makePatch(k)
    layoutLattice(patchRef.current, patchRef.current.spacing, 'corner')
    hist.current = { t: [], v: [] }
    info.current = { steps: 1, dt: sphMaxDt(patchRef.current.params) * ratio, broken: false }
    redraw()
    loop.play()
  }

  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: '', minChars: 7 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: '', minChars: 22 },
    { key: 'dtMax', symbol: '\\Delta t_{\\max}', label: '上限 0.3·h/√k', value: '', minChars: 8 },
    { key: 'steps', label: '1 フレームのステップ数', value: '', minChars: 9 },
    { key: 'vmax', label: '最大の速さ', value: '', minChars: 8 },
    { key: 'status', label: '状態', value: '', minChars: 5 },
  ]

  return (
    <SimShell
      label="時間の進め方のシミュレーション"
      aspect={1.6}
      height={HEIGHT}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="水槽の左に積んだ粒子が崩れるようす。時間刻みを大きくすると粒子が暴れ、さらに大きいと壊れる。右のグラフは粒子の最大の速さ。粒子をつかんで動かせる。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={legendItems} />
          <span className="sr-only" aria-live="polite" ref={live} />
        </>
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="\Delta t/\Delta t_{\max}" label="時間刻み ÷ 上限" value={ratio} min={0.25} max={8} step={0.25} onChange={setRatio} format={(v) => v.toFixed(2)} />
          <ParamSlider symbol="k" label="圧力の係数" unit="m²/s²" value={k} min={40} max={150} step={5} onChange={setK} />
        </>
      }
    />
  )
}
