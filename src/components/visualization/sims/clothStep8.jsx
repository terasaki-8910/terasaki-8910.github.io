import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { drawArrow, drawAxes, makeView } from '../axes'
import { AIR_DENSITY, PLATE_DEPTH, foldAngle, plateEnds, plateWindForces } from './clothPlate'
import { drawText } from './clothDraw'
import { clamp, fmtSigned } from './clothStepKit'

// 段階 8「風の力」: 風を受ける 1 枚の板。板の向き(角度 θ)をつかんで変えると、抗力 D・揚力 L・その和 F の矢印が変わる。
// 風は左から右(+x)へ。板が風下へ動くと、板に対する風の速さは「風 − 板の速さ」に減る。
// 力は massSpring.js の addWindForces(布の網の辺と同じ計算)で求める(clothPlate.js が抗力だけ・揚力だけ・両方で 3 回呼ぶ)。
// 時間は進めない(板は動かさない)。
const WORLD = { w: 3, h: 2 }
const CENTER = [1.65, 1.0]
const LENGTH = 0.6 // 板の長さ [m]
const MARGIN = { left: 40, right: 12, top: 24, bottom: 36 }
const PX_PER_N = 55 // 力の矢印 1 N の長さ [px]
const HANDLE_PX = 16 // 板の端の外側でもつかめる範囲 [px]
const BODY_PX = 12 // 板の線の近くでもつかめる範囲 [px]
const WIND_Y = [1.65, 1.0, 0.35]
const deg = (r) => (r * 180) / Math.PI
const rad = (d) => (d * Math.PI) / 180

const viewOf = (width, height) => makeView({ width, height, xRange: [0, WORLD.w], yRange: [0, WORLD.h], margin: MARGIN })

export default function ClothStep8() {
  const [wind, setWind] = useState(5)
  const [plateSpeed, setPlateSpeed] = useState(0)
  const [angle, setAngle] = useState(25)
  const [cd, setCd] = useState(1)
  const [cl, setCl] = useState(0.5)
  const [announce, setAnnounce] = useState('')
  const params = useRef({})
  params.current = { wind, plateSpeed, angle, cd, cl, grabbed: false }

  const forcesOf = (p) =>
    plateWindForces({ length: LENGTH, angle: rad(p.angle), windSpeed: p.wind, plateSpeed: p.plateSpeed, CD: p.cd, CL: p.cl })

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    const view = viewOf(width, height)
    const f = forcesOf(p)
    const theta = rad(p.angle)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })

    // 風(左から右へ。長さは風の速さに比例)
    if (p.wind > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
      ctx.clip()
      for (const y of WIND_Y) {
        drawArrow(ctx, view, 0.08, y, 0.08 + 0.13 * p.wind, y, { color: colors.muted, width: 1.8, head: 8 })
      }
      ctx.restore()
      drawText(ctx, `風 U = ${p.wind.toFixed(1)} m/s`, view.sx(0.1), view.sy(WIND_Y[0]) - 12, { color: colors.ink, size: 12, mono: true })
    } else {
      drawText(ctx, '風 U = 0（無風）', view.sx(0.1), view.sy(WIND_Y[0]) - 12, { color: colors.ink, size: 12, mono: true })
    }

    // 板
    const [x1, y1, x2, y2] = plateEnds(CENTER[0], CENTER[1], LENGTH, theta)
    ctx.save()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(view.sx(x1), view.sy(y1))
    ctx.lineTo(view.sx(x2), view.sy(y2))
    ctx.stroke()
    ctx.restore()
    for (const [hx, hy] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath()
      ctx.arc(view.sx(hx), view.sy(hy), 6, 0, Math.PI * 2)
      ctx.fillStyle = p.grabbed ? colors.accent : colors.alpha('accent', 0.6)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    }

    // 角度 θ(風の向きから板まで)
    const cx = view.sx(CENTER[0])
    const cy = view.sy(CENTER[1])
    ctx.save()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 46, cy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(cx, cy, 34, 0, -theta, theta > 0)
    ctx.stroke()
    ctx.restore()
    // 角度の文字は、円弧の真ん中の向きの少し外側
    const mid = -theta / 2
    drawText(ctx, `θ = ${p.angle < 0 ? '−' : ''}${Math.abs(p.angle)}°`, cx + 62 * Math.cos(mid) + 4, cy + 62 * Math.sin(mid) + (theta >= 0 ? -6 : 6), {
      color: colors.ink,
      size: 12,
      mono: true,
      halo: colors.surface,
    })

    // 板が風下へ動く速さ
    if (p.plateSpeed > 0) {
      const y = CENTER[1] - 0.32
      drawArrow(ctx, view, CENTER[0], y, CENTER[0] + 0.1 * p.plateSpeed, y, { color: colors.alpha('lane-2', 1), width: 2.5, head: 8 })
      drawText(ctx, `板の速さ v = ${p.plateSpeed.toFixed(1)} m/s`, view.sx(CENTER[0]), view.sy(y) + 14, { color: colors.ink, size: 11, mono: true })
    }

    // 力の矢印(板の中心から)。長さが枠を超えるときは縮める
    const maxLen = view.frame.width * 0.42
    const arrows = [
      { v: f.drag, color: colors.alpha('lane-0', 1), label: 'D', width: 2.5 },
      { v: f.lift, color: colors.alpha('lane-1', 1), label: 'L', width: 2.5 },
      { v: f.total, color: colors.ink, label: 'F', width: 4 },
    ]
    const longest = Math.max(...arrows.map((a) => Math.hypot(a.v[0], a.v[1]) * PX_PER_N))
    const shrink = longest > maxLen ? maxLen / longest : 1
    for (const a of arrows) {
      const len = Math.hypot(a.v[0], a.v[1])
      if (len * PX_PER_N * shrink < 3) continue
      const x1w = CENTER[0] + (a.v[0] * PX_PER_N * shrink) / view.scaleX
      const y1w = CENTER[1] + (a.v[1] * PX_PER_N * shrink) / view.scaleX
      drawArrow(ctx, view, CENTER[0], CENTER[1], x1w, y1w, { color: a.color, width: a.width, head: a.label === 'F' ? 11 : 9 })
      drawText(ctx, a.label, view.sx(x1w) + (a.v[0] >= 0 ? 7 : -7), view.sy(y1w) + (a.v[1] >= 0 ? -9 : 9), {
        color: colors.ink,
        size: 13,
        align: a.v[0] >= 0 ? 'left' : 'right',
        mono: true,
        halo: colors.surface,
      })
    }
    if (shrink < 1) drawText(ctx, '矢印は縮めて描いています', view.frame.right - 4, view.frame.bottom - 8, { color: colors.ink, size: 11, align: 'right' })
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  useEffect(() => {
    redraw()
  }, [wind, plateSpeed, angle, cd, cl, redraw])

  // ---- 板の向きをつかむ ----
  const geometry = (p) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    return { view, wx: view.wx(p.x), wy: view.wy(p.y) }
  }
  const onPlate = (p) => {
    const { view } = geometry(p)
    const [x1, y1, x2, y2] = plateEnds(CENTER[0], CENTER[1], LENGTH, rad(params.current.angle))
    const ax = view.sx(x1)
    const ay = view.sy(y1)
    const bx = view.sx(x2)
    const by = view.sy(y2)
    // 点と線分の距離
    const dx = bx - ax
    const dy = by - ay
    const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    const dist = Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy))
    const nearEnd = Math.hypot(p.x - ax, p.y - ay) <= HANDLE_PX || Math.hypot(p.x - bx, p.y - by) <= HANDLE_PX
    return nearEnd || dist <= BODY_PX
  }
  const rotateTo = (p) => {
    const { wx, wy } = geometry(p)
    const a = foldAngle(Math.atan2(wy - CENTER[1], wx - CENTER[0]))
    const d = Math.round(deg(a))
    params.current.angle = d
    setAngle(d)
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: onPlate,
    onDown: (p) => {
      if (!onPlate(p)) return false
      params.current.grabbed = true
      rotateTo(p)
    },
    onMove: rotateTo,
    onUp: () => {
      params.current.grabbed = false
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 15 : 5
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = angle + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = angle - step
    else if (event.key === 'Home') next = 0
    if (next === null) return
    event.preventDefault()
    const v = clamp(next, -90, 90)
    setAngle(v)
    setAnnounce(`板の角度 θ = ${v}°`)
  }

  const f = forcesOf({ wind, plateSpeed, angle, cd, cl })
  const mag = (v) => Math.hypot(v[0], v[1])
  const vec = (v) => `${mag(v).toFixed(2)} N（${fmtSigned(v[0], 2)}, ${fmtSigned(v[1], 2)}）`
  const legendItems = [
    { key: 'U', symbol: 'U', label: '風', value: `${wind.toFixed(1)} m/s →` },
    { key: 'rel', label: '板に対する風の速さ', value: `${f.relativeSpeed.toFixed(1)} m/s` },
    { key: 'S', symbol: 'S', label: '板の面積', value: `${(LENGTH * PLATE_DEPTH).toFixed(3)} m²（${LENGTH} m × ${PLATE_DEPTH} m）` },
    { key: 'rho', symbol: '\\rho', label: '空気の密度', value: `${AIR_DENSITY} kg/m³` },
    { key: 'D', symbol: 'D', label: '抗力', value: vec(f.drag), minChars: 22 },
    { key: 'L', symbol: 'L', label: '揚力', value: vec(f.lift), minChars: 22 },
    { key: 'F', symbol: 'F', label: '合力', value: vec(f.total), minChars: 22 },
  ]

  return (
    <SimShell
      label="風の力のシミュレーション"
      aspect={1.5}
      height={{ pc: [320, 400], phone: [280, 360] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="左から風が吹く中の1枚の板と、板が受ける抗力 D・揚力 L・合力 F の矢印。板をドラッグするか、左右の矢印キーで、板の角度を変えられる"
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
                setWind(5)
                setPlateSpeed(0)
                setAngle(25)
                setCd(1)
                setCl(0.5)
              }}
            />
          </SimToolbar>
          <ParamSlider symbol="\theta" label="板の角度" unit="°" value={angle} min={-90} max={90} step={1} onChange={setAngle} />
          <ParamSlider symbol="U" label="風の速さ" unit="m/s" value={wind} min={0} max={8} step={0.5} onChange={setWind} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="v" label="板が風下へ動く速さ" unit="m/s" value={plateSpeed} min={0} max={8} step={0.5} onChange={setPlateSpeed} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="C_D" label="抗力係数" value={cd} min={0} max={1.5} step={0.1} onChange={setCd} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="C_L" label="揚力係数" value={cl} min={-1} max={1} step={0.1} onChange={setCl} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
