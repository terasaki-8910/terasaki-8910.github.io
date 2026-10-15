import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import { fmt, drawParticle } from './fluidKit.js'
import { createPatch, settle, scatter, setCell, neighborsOf, BASE } from './fluidPatch.js'
import { WORLD_WIDE, viewFor, drawBoard, drawProbe, radiusPx } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'

// 段階 6「近傍探索（均一グリッド）」: 領域を 1 辺 h のセルに区切り、粒子をセルに振り分ける。粒子を 1 つ選ぶと、
// その粒子のセルと隣の 8 セル(あわせて 9 セル)だけを調べる。調べる候補(青緑)のうち、半径 h の中にいるもの(橙)が近い粒子。
// 全部の組を調べる総当たりに比べて、調べる組の数がどれだけ減るかを数で見せる。
// 計算は fluidPatch.js(utils/vis/sph.js の UniformGrid・findPairs・neighborsAt)。
const viewOf = (w, h) => viewFor(WORLD_WIDE, w, h)
const DEFAULT_N = 200

function makePatch(n, cellFactor) {
  const patch = createPatch({ cols: n, rows: 1, ...WORLD_WIDE })
  setCell(patch, cellFactor * patch.params.h)
  scatter(patch)
  return patch
}

export default function FluidStep6() {
  const [n, setN] = useState(DEFAULT_N)
  const [cellFactor, setCellFactor] = useState(1)
  const patchRef = useRef(null)
  if (patchRef.current === null) patchRef.current = makePatch(DEFAULT_N, 1)
  const seed = useRef(7)
  const legend = useRef(null)
  const live = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const { state, params } = patch
    const { grid, pos } = state
    const view = viewOf(width, height)
    drawBoard(ctx, view, colors, { width, height })
    const cell = grid.h

    // 選んだ粒子のセルと、隣の 8 セル
    const i = patch.selected
    const cx = Math.floor(pos[2 * i] / cell)
    const cy = Math.floor(pos[2 * i + 1] / cell)
    const x0 = Math.max(0, (cx - 1) * cell)
    const x1 = Math.min(patch.width, (cx + 2) * cell)
    const y0 = Math.max(0, (cy - 1) * cell)
    const y1 = Math.min(patch.height, (cy + 2) * cell)
    ctx.fillStyle = colors.alpha('ink', 0.08)
    ctx.fillRect(view.sx(x0), view.sy(y1), view.sx(x1) - view.sx(x0), view.sy(y0) - view.sy(y1))

    // セルの線
    ctx.strokeStyle = colors.alpha('muted', 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 1; c * cell < patch.width - 1e-9; c++) {
      const x = Math.round(view.sx(c * cell)) + 0.5
      ctx.moveTo(x, view.frame.top)
      ctx.lineTo(x, view.frame.bottom)
    }
    for (let c = 1; c * cell < patch.height - 1e-9; c++) {
      const y = Math.round(view.sy(c * cell)) + 0.5
      ctx.moveTo(view.frame.left, y)
      ctx.lineTo(view.frame.right, y)
    }
    ctx.stroke()
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 2
    ctx.strokeRect(view.sx(x0), view.sy(y1), view.sx(x1) - view.sx(x0), view.sy(y0) - view.sy(y1))

    // 粒子: 9 セルの外(薄い)、9 セルの中=候補(青緑)
    const r = radiusPx(view, 0.3)
    let candidates = 0
    for (let q = 0; q < patch.n; q++) {
      const qx = Math.floor(pos[2 * q] / cell)
      const qy = Math.floor(pos[2 * q + 1] / cell)
      const inside = Math.abs(qx - cx) <= 1 && Math.abs(qy - cy) <= 1
      if (inside) candidates++
      drawParticle(ctx, view.sx(pos[2 * q]), view.sy(pos[2 * q + 1]), r, inside ? colors.alpha('lane-1', 1) : colors.alpha('muted', 0.55), colors.alpha('ink', 0.55), 1)
    }
    // h の円と、その中の近い粒子(橙)
    const near = drawProbe(ctx, view, colors, patch, { weightOf: () => 1 })

    const total = (patch.n * (patch.n - 1)) / 2
    legend.current?.update({
      n: `${patch.n} 個`,
      cells: `${grid.nx} × ${grid.ny} = ${grid.nx * grid.ny} 個`,
      mine: `${candidates - 1} 個 → 近い ${near} 個`,
      checked: `${grid.checked}（総当たりなら ${total}）`,
    })
  }, [])

  const afterMove = () => {
    settle(patchRef.current)
    redraw()
  }
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const { canvasRef, redraw, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved: afterMove, announce, keyStep: 0.006 })

  // 粒子の数を変えたら作り直す
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    patchRef.current = makePatch(n, cellFactor)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])
  useEffect(() => {
    setCell(patchRef.current, cellFactor * BASE.h)
    redraw()
  }, [cellFactor, redraw])

  function scatterAgain() {
    seed.current += 1
    scatter(patchRef.current, seed.current)
    redraw()
  }

  const legendItems = [
    { key: 'n', symbol: 'N', label: '粒子の数', value: '', minChars: 6 },
    { key: 'cells', label: 'セルの数', value: '', minChars: 11 },
    { key: 'mine', label: '選んだ粒子の候補（9 セル内）', value: '', minChars: 14 },
    { key: 'checked', label: '全体で距離を調べた組', value: '', minChars: 18 },
  ]

  return (
    <SimShell
      label="近傍探索のシミュレーション"
      aspect={1.3}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="領域をセルに区切って粒子を振り分けた図。選んだ粒子のセルと隣の 8 セルの粒子だけが、近い粒子の候補になる。粒子をつかんで動かせる。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
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
            <ResetButton onClick={scatterAgain}>ばらまき直す</ResetButton>
          </SimToolbar>
          <ParamSlider symbol="N" label="粒子の数" unit="個" value={n} min={40} max={400} step={10} onChange={setN} />
          <ParamSlider symbol="c/h" label="セルの 1 辺 ÷ h" value={cellFactor} min={1} max={3} step={0.5} onChange={setCellFactor} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
