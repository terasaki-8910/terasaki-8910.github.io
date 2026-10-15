import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import { makeView, drawAxes } from '../axes'
import { BROAD_H, BROAD_W, overlapInfo } from './rigidMath'
import { useCircleDrag } from './rigidHooks'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneAlpha, laneColor, markerCircle, strokeFillCircle } from './rigidKit'

// 段階 3「円の重なり判定」: 2 つの円をつかんで動かす。
// 中心間の距離の 2 乗 d² と、半径の和の 2 乗 (r1 + r2)² を比べる(平方根は要らない)。d² ≤ (r1 + r2)² なら重なっている。
// 図では、中心を結ぶ線の上に r1(円 1 の色)と r2(円 2 の色)の長さを重ねる。r1 + r2 が d に届けば重なる。
// 計算は rigidMath.js(collide.js の circlesOverlap)。ここは画面と操作。
const INITIAL = { c1: [1.4, 1.5], c2: [2.4, 1.8], r1: 0.5, r2: 0.35 }
const KEY_STEP = 0.05 // 矢印キーで動かす量 [m]

const viewOf = (width, height) =>
  makeView({ width, height, xRange: [0, BROAD_W], yRange: [0, BROAD_H], equal: true, margin: STEP_MARGIN })

export default function RigidStep3() {
  const [pos, setPos] = useState({ c1: INITIAL.c1, c2: INITIAL.c2 })
  const [r1, setR1] = useState(INITIAL.r1)
  const [r2, setR2] = useState(INITIAL.r2)
  const [active, setActive] = useState('1') // 矢印キーで動かす円
  const { c1, c2 } = pos
  const info = overlapInfo(c1, r1, c2, r2)

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })

    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()
    const hit = info.overlap
    const lw = hit ? 3 : 1.75
    strokeFillCircle(ctx, view, c1, r1, { fill: laneAlpha(colors, 0, hit ? 0.5 : 0.28), stroke: colors.ink, lineWidth: lw })
    strokeFillCircle(ctx, view, c2, r2, { fill: laneAlpha(colors, 3, hit ? 0.5 : 0.28), stroke: colors.ink, lineWidth: lw })

    // 中心を結ぶ線(d)と、そこに重ねた r1・r2 の長さ
    const ax = view.sx(c1[0])
    const ay = view.sy(c1[1])
    const bx = view.sx(c2[0])
    const by = view.sy(c2[1])
    const len = Math.hypot(bx - ax, by - ay)
    if (len > 1) {
      const ux = (bx - ax) / len
      const uy = (by - ay) / len
      const p1 = r1 * view.scaleX
      const p2 = r2 * view.scaleX
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineWidth = 4
      ctx.lineCap = 'butt'
      // r1 は線の上側、r2 は下側にずらして、重なっていても 2 本が見えるようにする
      const nx = -uy * 3
      const ny = ux * 3
      ctx.strokeStyle = laneColor(colors, 0)
      ctx.beginPath()
      ctx.moveTo(ax + nx, ay + ny)
      ctx.lineTo(ax + nx + ux * p1, ay + ny + uy * p1)
      ctx.stroke()
      ctx.strokeStyle = laneColor(colors, 3)
      ctx.beginPath()
      ctx.moveTo(bx - nx, by - ny)
      ctx.lineTo(bx - nx - ux * p2, by - ny - uy * p2)
      ctx.stroke()
    }
    markerCircle(ctx, ax, ay, 3, { fill: colors.ink })
    markerCircle(ctx, bx, by, 3, { fill: colors.ink })
    drawText(ctx, '1', ax - 10, ay - 6, { color: colors.ink, size: 12, align: 'right', baseline: 'bottom' })
    drawText(ctx, '2', bx + 10, by - 6, { color: colors.ink, size: 12, align: 'left', baseline: 'bottom' })
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  })

  // 最新の円(つかむ当たり判定と、動かす先に使う)
  const latest = useRef({})
  latest.current = { c1, c2, r1, r2 }
  useCircleDrag(canvasRef, {
    getView: () => viewOf(sizeRef.current.width, sizeRef.current.height),
    getCircles: () => [
      { c: latest.current.c1, r: latest.current.r1 },
      { c: latest.current.c2, r: latest.current.r2 },
    ],
    onGrab: (i) => setActive(String(i + 1)),
    onMove: (i, c) => setPos((p) => (i === 0 ? { ...p, c1: c } : { ...p, c2: c })),
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const key = active === '1' ? 'c1' : 'c2'
    setPos((p) => ({
      ...p,
      [key]: [clamp(p[key][0] + step.dx * KEY_STEP, 0, BROAD_W), clamp(p[key][1] + step.dy * KEY_STEP, 0, BROAD_H)],
    }))
  }

  function reset() {
    setPos({ c1: INITIAL.c1, c2: INITIAL.c2 })
    setR1(INITIAL.r1)
    setR2(INITIAL.r2)
  }

  const legendItems = [
    { key: 'c1', label: '円 1 の半径 r1', swatch: 'var(--lane-0)' },
    { key: 'c2', label: '円 2 の半径 r2', swatch: 'var(--lane-3)' },
    { key: 'd2', symbol: 'd^2', label: '中心間の距離の 2 乗', value: `${fmt(info.d2, 3)} m²`, minChars: 9 },
    { key: 'rr2', symbol: '(r_1+r_2)^2', label: '半径の和の 2 乗', value: `${fmt(info.rr2, 3)} m²`, minChars: 9 },
    { key: 'verdict', label: '判定', value: info.overlap ? 'd² ≤ (r1+r2)² で、重なっている' : 'd² > (r1+r2)² で、重なっていない' },
  ]

  return (
    <SimShell
      label="2 つの円の重なり判定"
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="2 つの円。円をドラッグして動かすと、中心間の距離の 2 乗と半径の和の 2 乗の比較が変わる。矢印キーでは、選んだ円を動かせる"
        />
      }
      legend={<SimLegend items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <ModeSwitch
              label="矢印キーで動かす円"
              value={active}
              onChange={setActive}
              options={[
                { value: '1', label: '円 1' },
                { value: '2', label: '円 2' },
              ]}
              variant="quiet"
            />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="r_1" label="円 1 の半径" unit="m" value={r1} min={0.1} max={0.9} step={0.05} onChange={setR1} format={(v) => v.toFixed(2)} />
          <ParamSlider symbol="r_2" label="円 2 の半径" unit="m" value={r2} min={0.1} max={0.9} step={0.05} onChange={setR2} format={(v) => v.toFixed(2)} />
        </>
      }
    />
  )
}
