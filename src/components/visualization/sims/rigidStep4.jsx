import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop, { prefersReducedMotion } from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes } from '../axes'
import { BROAD_H, BROAD_W, MAX_SCATTER, activeAt, broadStats, makeScatter, packRows } from './rigidMath'
import { pickCircle } from './rigidHooks'
import { STEP_MARGIN, arrowStep, clamp, drawText, laneAlpha, laneColor, markerCircle } from './rigidKit'

// 段階 4「広域の判定(AABB と Sweep and Prune)」: たくさんの円を、囲む箱(AABB)で調べる。
// 絵の下の帯は、各 AABB を x 軸に落とした区間(重ならないように段に並べてある)。縦の線(走査線)を左から右へ動かし、
// 新しい箱の左端が現れたら、いま線にかかっている箱とだけ比べる。x で重なっていて、y でも重なれば候補。
// 円をつかんで動かすと数が変わる。走査線もつかんで動かせる(左右の矢印キーでも)。
// 計算は rigidMath.js(collide.js の sweepAndPrune・aabbOverlap・circlesOverlap)。ここは画面と操作。
const POOL = makeScatter()
const STRIP_H = 44 // x への射影の帯の高さ [px]
const MARGIN = { ...STEP_MARGIN, bottom: STEP_MARGIN.bottom + STRIP_H + 18 }
const SWEEP_SPEED = 0.9 // 走査線の速さ [m/s]
const HOLD = 1.2 // 右端に着いてから、最初に戻るまでの間 [s]
const KEY_STEP = 0.1 // 矢印キーで動かす量 [m]

const viewOf = (width, height) =>
  makeView({ width, height, xRange: [0, BROAD_W], yRange: [0, BROAD_H], equal: true, margin: MARGIN })
const stripTopOf = (view) => view.frame.bottom + 40
const stripBottomOf = (view) => stripTopOf(view) + STRIP_H

export default function RigidStep4() {
  const [count, setCount] = useState(20)
  const [pos, setPos] = useState(() => POOL.map((b) => b.c))
  const circles = useMemo(() => pos.slice(0, count).map((c, i) => ({ c, r: POOL[i].r })), [pos, count])
  const stats = useMemo(() => broadStats(circles), [circles])
  const rows = useMemo(() => packRows(stats.boxes), [stats])

  const sweep = useRef(prefersReducedMotion() ? BROAD_W : 0) // 走査線の x [m]
  const hold = useRef(0)
  const legend = useRef(null)
  const latest = useRef({})
  latest.current = { circles, stats }
  const grab = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    const xs = sweep.current
    const { boxes, pairs, hit, foundX } = stats
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.strokeRect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })

    const active = new Set(activeAt(boxes, xs))
    const px = view.sx
    const py = view.sy
    const s = view.scaleX
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()

    // AABB(走査線にかかっている箱は色をつける)
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const x = px(b.min[0])
      const y = py(b.max[1])
      const w = (b.max[0] - b.min[0]) * s
      const h = (b.max[1] - b.min[1]) * s
      if (active.has(i)) {
        ctx.fillStyle = laneAlpha(colors, 1, 0.2)
        ctx.fillRect(x, y, w, h)
      }
      ctx.strokeStyle = active.has(i) ? laneColor(colors, 1) : colors.alpha('ink', 0.6)
      ctx.lineWidth = active.has(i) ? 2 : 1
      ctx.strokeRect(x, y, w, h)
    }
    // 円
    ctx.lineWidth = 1.5
    ctx.strokeStyle = colors.ink
    ctx.fillStyle = colors.alpha('accent', 0.6)
    for (let i = 0; i < circles.length; i++) {
      const b = circles[i]
      ctx.beginPath()
      ctx.arc(px(b.c[0]), py(b.c[1]), b.r * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // 走査線の左で見つかった候補の組(細い線)と、その中で円が重なっている組(太い線)
    for (const wide of [false, true]) {
      ctx.strokeStyle = wide ? colors.ink : colors.muted
      ctx.lineWidth = wide ? 2.5 : 1
      ctx.beginPath()
      for (let k = 0; k < pairs.length; k++) {
        if (foundX[k] > xs || hit[k] !== wide) continue
        const a = circles[pairs[k][0]].c
        const b = circles[pairs[k][1]].c
        ctx.moveTo(px(a[0]), py(a[1]))
        ctx.lineTo(px(b[0]), py(b[1]))
      }
      ctx.stroke()
    }
    ctx.restore()

    // x 軸に落とした区間の帯
    const top = stripTopOf(view)
    const rowH = Math.min(7, STRIP_H / rows.rows)
    const barH = Math.max(2, rowH - 2)
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(view.frame.left, top - 3.5)
    ctx.lineTo(view.frame.right, top - 3.5)
    ctx.stroke()
    for (let i = 0; i < boxes.length; i++) {
      const y = top + rows.row[i] * rowH
      const x0 = px(boxes[i].min[0])
      ctx.fillStyle = active.has(i) ? laneColor(colors, 1) : colors.alpha('ink', 0.6)
      ctx.fillRect(x0, y, Math.max(1.5, px(boxes[i].max[0]) - x0), barH)
    }
    drawText(ctx, '射影', view.frame.left - 6, top + STRIP_H / 2, { color: colors.ink, size: 11, align: 'right', baseline: 'middle' })

    // 走査線と、つかむ取っ手(下)
    const lx = px(xs)
    const bottom = stripBottomOf(view)
    ctx.strokeStyle = laneColor(colors, 1)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lx, view.frame.top)
    ctx.lineTo(lx, bottom)
    ctx.stroke()
    markerCircle(ctx, lx, bottom + 8, 6, {
      fill: laneColor(colors, 1),
      stroke: colors.ink,
      lineWidth: grab.current?.kind === 'sweep' ? 3 : 1.5,
    })
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  // 走査線にかかっている箱の数と、走査線の左で見つかった候補の数(毎フレーム変わるので、文字だけ書き換える)
  const publish = () => {
    const { stats: st } = latest.current
    const xs = sweep.current
    let found = 0
    for (const fx of st.foundX) if (fx <= xs) found++
    legend.current?.update({ active: `${activeAt(st.boxes, xs).length} 個`, found: `${found} / ${st.candidates} 組` })
  }
  useEffect(() => {
    publish()
    redraw()
  })

  const loop = useSimLoop(
    (dt) => {
      if (sweep.current >= BROAD_W) {
        hold.current += dt
        if (hold.current >= HOLD) {
          hold.current = 0
          sweep.current = 0
        }
      } else {
        sweep.current = Math.min(BROAD_W, sweep.current + SWEEP_SPEED * dt)
      }
      publish()
      redraw()
    },
    { targetRef: canvasRef },
  )

  // つかめるもの: 円(先)と、走査線(線の左右 14 px と、取っ手)
  const pickAt = (p) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    const i = pickCircle(view, latest.current.circles, p)
    if (i >= 0) return { kind: 'circle', index: i }
    const lx = view.sx(sweep.current)
    if (Math.abs(p.x - lx) <= 14 && p.y >= view.frame.top - 4 && p.y <= stripBottomOf(view) + 16) return { kind: 'sweep' }
    return null
  }

  usePointerDrag(canvasRef, {
    canGrab: (p) => pickAt(p) !== null,
    onDown: (p) => {
      const found = pickAt(p)
      if (!found) return false
      const view = viewOf(sizeRef.current.width, sizeRef.current.height)
      if (found.kind === 'circle') {
        const c = latest.current.circles[found.index].c
        grab.current = { ...found, ox: view.wx(p.x) - c[0], oy: view.wy(p.y) - c[1] }
      } else {
        grab.current = found
        loop.pause() // 走査線を自分で動かすあいだは、自動の走査を止める
        sweep.current = clamp(view.wx(p.x), 0, BROAD_W)
        publish()
        redraw()
      }
    },
    onMove: ({ x, y }) => {
      const g = grab.current
      if (!g) return
      const view = viewOf(sizeRef.current.width, sizeRef.current.height)
      if (g.kind === 'circle') {
        const r = POOL[g.index].r
        const next = [clamp(view.wx(x) - g.ox, r, BROAD_W - r), clamp(view.wy(y) - g.oy, r, BROAD_H - r)]
        setPos((prev) => prev.map((c, i) => (i === g.index ? next : c)))
      } else {
        sweep.current = clamp(view.wx(x), 0, BROAD_W)
        publish()
        redraw()
      }
    },
    onUp: () => {
      grab.current = null
      redraw()
    },
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step || step.dx === 0) return
    event.preventDefault()
    loop.pause()
    sweep.current = clamp(sweep.current + step.dx * KEY_STEP, 0, BROAD_W)
    publish()
    redraw()
  }

  function reset() {
    setPos(POOL.map((b) => b.c))
    sweep.current = 0
    hold.current = 0
    publish()
    redraw()
  }

  const legendItems = [
    { key: 'total', label: '総当たり N(N−1)/2', value: `${stats.total} 組`, minChars: 5 },
    { key: 'xov', label: 'x の区間が重なる', value: `${stats.xOverlap} 組`, minChars: 5 },
    { key: 'cand', label: '候補（AABB が重なる）', value: `${stats.candidates} 組`, minChars: 4, swatch: 'var(--color-muted)' },
    { key: 'hit', label: '衝突（円が重なる）', value: `${stats.contacts} 組`, minChars: 4, swatch: 'var(--color-ink)' },
    { key: 'active', label: '走査線にかかる箱', value: '', minChars: 5, swatch: 'var(--lane-1)' },
    { key: 'found', label: '走査線の左で見つけた候補', value: '', minChars: 9 },
  ]

  return (
    <SimShell
      label="AABB と Sweep and Prune による広域の判定"
      height={{ pc: [380, 470], phone: [360, 440] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="たくさんの円と、それを囲む軸平行な箱。下の帯は、箱を x 軸に落とした区間。縦の線を左から右へ動かし、重なる箱の組を候補として見つける。円と縦の線はドラッグで動かせ、縦の線は左右の矢印キーでも動かせる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="N" label="円の数" unit="個" value={count} min={5} max={MAX_SCATTER} step={1} onChange={setCount} />
        </>
      }
    />
  )
}
