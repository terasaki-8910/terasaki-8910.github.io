import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import { rampColor, unit, fmt } from './fluidKit.js'
import { createPatch, layoutLattice, settle, setSmoothing, densityParts } from './fluidPatch.js'
import { WORLD, viewFor, drawBoard, drawParticles, drawProbe } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'
import { poly6 } from '../../../utils/vis/sph.js'

// 段階 2「密度」: 2 次元に並べた粒子を 1 つ選ぶと、半径 h の円の中の粒子が、近いほど濃く(重み m·W が大きく)光る。
// その重みを足したものが、選んだ粒子の密度 ρ。粒子をつかんで動かすと、まわりの密度が変わる(色は ρ/ρ0)。
// 計算は fluidPatch.js(utils/vis/sph.js の sphStep が出す密度)。
const H_MAX = 0.06
const DENSITY_LOW = 0.6 // ρ/ρ0 がこれ以下で ink(全体のシミュレーションと同じ)
const DENSITY_HIGH = 1.1 // これ以上で FAST_COLOR
const viewOf = (w, h) => viewFor(WORLD, w, h)

export default function FluidStep2() {
  const [h, setH] = useState(0.05)
  const patchRef = useRef(null)
  if (patchRef.current === null) patchRef.current = createPatch({ cols: 12, rows: 9, ...WORLD, cell: H_MAX })
  const hRef = useRef(h)
  hRef.current = h
  const legend = useRef(null)
  const live = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const view = viewOf(width, height)
    const { state, params } = patch
    drawBoard(ctx, view, colors, { width, height })
    drawParticles(ctx, view, colors, patch, (i) => rampColor(colors, unit(state.rho[i] / params.rho0, DENSITY_LOW, DENSITY_HIGH)))
    const w0 = poly6(0, params.h)
    const { pos } = state
    const i = patch.selected
    drawProbe(ctx, view, colors, patch, {
      weightOf: (j) => poly6((pos[2 * j] - pos[2 * i]) ** 2 + (pos[2 * j + 1] - pos[2 * i + 1]) ** 2, params.h) / w0,
    })
    const parts = densityParts(patch, i)
    legend.current?.update({
      h: `${fmt(params.h)} m`,
      count: `${parts.count} 個`,
      self: fmt(parts.self, 1),
      others: fmt(parts.others, 1),
      rho: fmt(parts.rho, 1),
      ratio: fmt(parts.rho / params.rho0, 2),
    })
  }, [])

  const afterMove = () => {
    settle(patchRef.current)
    redraw()
  }
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const { canvasRef, redraw, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved: afterMove, announce })

  useEffect(() => {
    setSmoothing(patchRef.current, h)
    settle(patchRef.current)
    redraw()
  }, [h, redraw])

  function reset() {
    const patch = patchRef.current
    layoutLattice(patch)
    patch.selected = Math.floor(patch.rows / 2) * patch.cols + Math.floor(patch.cols / 2)
    redraw()
  }

  const legendItems = [
    { key: 'h', symbol: 'h', label: '影響半径', value: '', minChars: 7 },
    { key: 'count', label: '半径 h の中の粒子', value: '', minChars: 5 },
    { key: 'self', label: '自分の分 m·W(0)', value: '', minChars: 6 },
    { key: 'others', label: '近くの粒子の分', value: '', minChars: 6 },
    { key: 'rho', symbol: '\\rho', label: '密度（kg/m²）', value: '', minChars: 7 },
    { key: 'ratio', symbol: '\\rho/\\rho_0', label: '休止密度との比', value: '', minChars: 5 },
    { label: '粒子の色（ρ/ρ0）', value: '0.6 → 1.1 以上', swatch: 'linear-gradient(to right, var(--color-ink), var(--lane-1))' },
  ]

  return (
    <SimShell
      label="密度のシミュレーション"
      aspect={1.3}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="格子状に並んだ粒子。選んだ粒子のまわりの半径 h の円と、その中の粒子の重みを示す。粒子をつかんで動かせる。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
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
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="h" label="影響半径" unit="m" value={h} min={0.03} max={H_MAX} step={0.005} onChange={setH} format={(v) => v.toFixed(3)} />
        </>
      }
    />
  )
}
