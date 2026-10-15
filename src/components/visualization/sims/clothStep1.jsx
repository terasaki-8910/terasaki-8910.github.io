import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { drawAxes, makeView } from '../axes'
import { L0, X_LIMIT, hookeForce } from './clothSpring1d'
import { splitLayout } from './clothTrace'
import { PLOT_MARGIN, drawPlotKey, drawSpringPicture, overMass, pictureView } from './clothDraw'
import { clamp, fmtSigned } from './clothStepKit'

// 段階 1「フックの法則」: 壁につないだ 1 本のバネと 1 つのおもり。おもりをつかんで引く(または伸びのスライダー、矢印キー)と、
// 伸び x と、バネが引く力 F = −kx の矢印と、F–x のグラフの点が追従する。ここでは時間を進めない(手で置いた位置の力を見る)。
// 力は clothSpring1d.js の hookeForce(massSpring.js の springForce)で求める。
const MASS = 1 // [kg]。絵のおもりの大きさだけに使う
const F_RANGE = 30 // グラフの縦軸の範囲 ±[N]。k の最大 40 N/m × 0.6 m = 24 N が収まる
const X_RANGE = 0.7 // グラフの横軸の範囲 ±[m]
const STEP_KEY = 0.05 // 矢印キー 1 回の動き [m]
const round2 = (v) => Math.round(v * 100) / 100
const layoutOf = (width, height) => splitLayout(width, height, { sideRatio: 0.5, stackRatio: 0.46 })

export default function ClothStep1() {
  const [k, setK] = useState(16)
  const [x, setX] = useState(0.3)
  const [announce, setAnnounce] = useState('')
  const params = useRef({ k, x, grabbed: false, dx: 0 })
  params.current.k = k
  params.current.x = x

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const { k: kk, x: xx, grabbed } = params.current
    const F = hookeForce(kk, xx)
    const lane = colors.alpha('lane-0', 1)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const { a, b } = layoutOf(width, height)

    // 絵: バネとおもり、力の矢印、伸び
    ctx.save()
    ctx.translate(a.x, a.y)
    drawSpringPicture(ctx, pictureView(a, { top: 26 }), colors, {
      x: xx,
      m: MASS,
      grabbed,
      force: { value: F, color: lane, text: `F = ${fmtSigned(F, 1)} N` },
      extension: { color: colors.ink, text: `x = ${fmtSigned(xx, 2)} m` },
    })
    ctx.restore()

    // グラフ: F–x。傾きが −k の直線と、いまの点
    ctx.save()
    ctx.translate(b.x, b.y)
    const view = makeView({ width: b.w, height: b.h, xRange: [-X_RANGE, X_RANGE], yRange: [-F_RANGE, F_RANGE], equal: false, margin: PLOT_MARGIN })
    drawAxes(ctx, view, { colors, xLabel: '伸び x [m]', yLabel: '力 F [N]' })
    const { frame } = view
    ctx.save()
    ctx.beginPath()
    ctx.rect(frame.left, frame.top, frame.width, frame.height)
    ctx.clip()
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(view.sx(0), frame.top)
    ctx.lineTo(view.sx(0), frame.bottom)
    ctx.moveTo(frame.left, view.sy(0))
    ctx.lineTo(frame.right, view.sy(0))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = lane
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(view.sx(-X_LIMIT), view.sy(hookeForce(kk, -X_LIMIT)))
    ctx.lineTo(view.sx(X_LIMIT), view.sy(hookeForce(kk, X_LIMIT)))
    ctx.stroke()
    // 点から x 軸（F = 0 の線）までの縦の線 = 力の大きさ
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(view.sx(xx), view.sy(0))
    ctx.lineTo(view.sx(xx), view.sy(F))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = grabbed ? colors.accent : colors.alpha('accent', 0.6)
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(view.sx(xx), view.sy(F), 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    drawPlotKey(ctx, view, colors, [{ label: `F = −kx（傾き −k = −${kk} N/m）`, color: lane, width: 2.5 }])
    ctx.restore()
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  useEffect(() => {
    redraw()
  }, [k, x, redraw])

  // 絵の領域の中での座標にする
  const local = ({ x: px, y: py }) => {
    const { width, height } = sizeRef.current
    const { a } = layoutOf(width, height)
    return { a, view: pictureView(a, { top: 26 }), px: px - a.x, py: py - a.y }
  }
  const hit = (p) => {
    const { view, px, py } = local(p)
    return overMass(view, params.current.x, MASS, px, py)
  }
  const moveTo = (p) => {
    const { view, px } = local(p)
    const next = clamp(round2(view.wx(px - params.current.dx) - L0), -X_LIMIT, X_LIMIT)
    params.current.x = next
    setX(next)
    redraw()
  }

  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (p) => {
      if (!hit(p)) return false
      const { view, px } = local(p)
      params.current.grabbed = true
      params.current.dx = px - view.sx(L0 + params.current.x) // つかんだ位置の、おもりの中心からのずれ
      redraw()
    },
    onMove: moveTo,
    onUp: () => {
      params.current.grabbed = false
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 4 * STEP_KEY : STEP_KEY
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = x + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = x - step
    else if (event.key === 'Home') next = 0
    if (next === null) return
    event.preventDefault()
    const v = clamp(round2(next), -X_LIMIT, X_LIMIT)
    setX(v)
    setAnnounce(`伸び x = ${fmtSigned(v, 2)} m、力 F = ${fmtSigned(hookeForce(k, v), 1)} N`)
  }

  const F = hookeForce(k, x)
  const direction = F > 0 ? '右向き（縮んだのを戻す）' : F < 0 ? '左向き（壁の向き）' : '力なし'
  const legendItems = [
    { key: 'x', symbol: 'x', label: '伸び', value: `${fmtSigned(x, 2)} m`, minChars: 7 },
    { key: 'F', symbol: 'F', label: '力', value: `${fmtSigned(F, 1)} N ${direction}`, minChars: 8 },
    { key: 'k', symbol: 'k', label: 'ばね定数', value: `${k} N/m` },
    { key: 'L0', symbol: 'L_0', label: '自然長', value: `${L0.toFixed(2)} m` },
  ]

  return (
    <SimShell
      label="フックの法則のシミュレーション"
      aspect={1.6}
      height={{ pc: [300, 380], phone: [320, 400] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="壁につないだバネとおもり、力 F と伸び x の関係のグラフ。おもりをドラッグするか、左右の矢印キーで伸びを変えられる"
        />
      }
      legend={
        <>
          <SimLegend items={legendItems} />
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar>
            <ResetButton
              onClick={() => {
                setX(0.3)
                setK(16)
              }}
            />
          </SimToolbar>
          <ParamSlider symbol="x" label="伸び" unit="m" value={x} min={-X_LIMIT} max={X_LIMIT} step={0.01} onChange={setX} format={(v) => fmtSigned(v, 2)} />
          <ParamSlider symbol="k" label="ばね定数" unit="N/m" value={k} min={4} max={40} step={1} onChange={setK} />
        </>
      }
    />
  )
}
