import { useEffect, useRef } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes, makeView } from '../../visualization/axes'
import { arrowStep, clamp, fmt, laneAlpha, laneColor } from '../../visualization/sims/rigidKit'
import { classifyCriticalPoint, evenlySpacedStreamlines } from '../../../utils/vis/flow'
import { drawSubLabel } from './labelKit'
import {
  CRITICAL_LABEL, CRITICAL_MARK, HANDLE_R, addChevron, clipToFrame, drawCriticalSymbol, drawHandle, drawLabel, fitView,
} from './flowKit'

const TR_RANGE = [-3, 3]
const DET_RANGE = [-2, 3]
const START = { tr: -0.6, det: 1.6 } // らせん(吸い込み)の領域の初めの点
const PORTRAIT = [-1.6, 1.6]
const ANGLE = Math.PI / 6 // 実数の固有値のときの、固有ベクトルの向き(30°)
const MARGIN_TOP = 24
const MARGIN_BOTTOM = 36
const CUT_RADIUS = 0.2 // 原点のこの距離より内側は線を引かない(らせんの中心では、1 歩が距離より大きくなって線が乱れる)

// 画面を 2 つに分ける: 左は (tr J, det J) の平面、右は流れの図
function layout(width, height) {
  const leftWidth = clamp(Math.round(width * 0.42), 150, 360)
  const plane = makeView({ width, height, xRange: TR_RANGE, yRange: DET_RANGE, equal: false, margin: { left: 38, right: width - leftWidth, top: MARGIN_TOP, bottom: MARGIN_BOTTOM } })
  const portrait = fitView(width, height, PORTRAIT, PORTRAIT, { left: leftWidth + 34, right: 12, top: MARGIN_TOP, bottom: MARGIN_BOTTOM })
  return { plane, portrait }
}

// (tr, det) から作る行列 J。実数の固有値(tr² ≥ 4 det)は diag(λ1, λ2) を 30° 回したもの、複素数は [[tr/2, −ω], [ω, tr/2]]
function matrixFor(tr, det) {
  const disc = tr * tr - 4 * det
  if (disc >= 0) {
    const s = Math.sqrt(disc)
    const l1 = (tr + s) / 2
    const l2 = (tr - s) / 2
    const c = Math.cos(ANGLE)
    const n = Math.sin(ANGLE)
    return [
      [l1 * c * c + l2 * n * n, (l1 - l2) * c * n],
      [(l1 - l2) * c * n, l1 * n * n + l2 * c * c],
    ]
  }
  const w = Math.sqrt(det - (tr * tr) / 4)
  return [[tr / 2, -w], [w, tr / 2]]
}

const eigenText = (eigenvalues) => {
  const [a, b] = eigenvalues
  if (Math.abs(a.im) < 1e-9) return `${fmt(a.re, 2)}, ${fmt(b.re, 2)}`
  return `${fmt(a.re, 2)} ± ${fmt(Math.abs(a.im), 2)}i`
}

// 点 (0, 0) から向き (dx, dy) へ、枠の内側(余白 inset px)に収まる一番遠い画面の点
function farthestInside(view, origin, dir, inset) {
  const { frame } = view
  let t = Infinity
  if (dir[0] > 0) t = Math.min(t, (frame.right - inset - origin[0]) / dir[0])
  if (dir[0] < 0) t = Math.min(t, (frame.left + inset - origin[0]) / dir[0])
  if (dir[1] > 0) t = Math.min(t, (frame.bottom - inset - origin[1]) / dir[1])
  if (dir[1] < 0) t = Math.min(t, (frame.top + inset - origin[1]) / dir[1])
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t]
}

// evenlySpacedStreamlines が返す線を、描くために整える。閉じた曲線(渦心)は 1 周で止め、原点のそばは除く。
// 線は 400 歩まで進むので、そのままだと閉じた曲線を何周も重ねて描き、矢じりも何周ぶん付いてしまう
function tidyLines(lines, step) {
  const out = []
  for (const line of lines) {
    let end = line.length
    let travelled = 0
    for (let i = 1; i < line.length; i++) {
      travelled += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
      if (travelled > 6 * step && Math.hypot(line[i][0] - line[0][0], line[i][1] - line[0][1]) < 1.2 * step) {
        end = i + 1
        break
      }
    }
    let run = []
    for (let i = 0; i < end; i++) {
      if (Math.hypot(line[i][0], line[i][1]) >= CUT_RADIUS) {
        run.push(line[i])
      } else {
        if (run.length > 1) out.push(run)
        run = []
      }
    }
    if (run.length > 1) out.push(run)
  }
  return out
}

function drawPlane(ctx, view, colors, point) {
  const { frame } = view
  const parabola = []
  for (let i = 0; i <= 60; i++) {
    const tr = TR_RANGE[0] + ((TR_RANGE[1] - TR_RANGE[0]) * i) / 60
    parabola.push([tr, (tr * tr) / 4])
  }
  const fill = (points, color) => {
    ctx.fillStyle = color
    ctx.beginPath()
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
      else ctx.lineTo(view.sx(x), view.sy(y))
    })
    ctx.closePath()
    ctx.fill()
  }
  clipToFrame(ctx, view, () => {
    // 領域の色: 鞍点(det < 0)、湧き出し・吸い込み(実数の固有値)、らせん・渦心(複素数の固有値)
    fill([[TR_RANGE[0], DET_RANGE[0]], [TR_RANGE[1], DET_RANGE[0]], [TR_RANGE[1], 0], [TR_RANGE[0], 0]], laneAlpha(colors, 3, 0.2))
    fill([...parabola, [TR_RANGE[1], 0], [TR_RANGE[0], 0]], laneAlpha(colors, 1, 0.2))
    fill([...parabola, [TR_RANGE[1], DET_RANGE[1]], [TR_RANGE[0], DET_RANGE[1]]], laneAlpha(colors, 0, 0.2))
    // 境界: det = 0 と放物線 det = tr²/4
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(view.sx(TR_RANGE[0]), view.sy(0))
    ctx.lineTo(view.sx(TR_RANGE[1]), view.sy(0))
    ctx.stroke()
    ctx.lineWidth = 1.8
    ctx.beginPath()
    parabola.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
      else ctx.lineTo(view.sx(x), view.sy(y))
    })
    ctx.stroke()
    // 渦心は tr = 0 の線の上(det > 0)
    ctx.lineWidth = 3.4
    ctx.beginPath()
    ctx.moveTo(view.sx(0), view.sy(0))
    ctx.lineTo(view.sx(0), view.sy(DET_RANGE[1]))
    ctx.stroke()
    const name = (text, x, y, align = 'center') => {
      const half = text.length * 5.5 + 2
      const px = clamp(view.sx(x), frame.left + (align === 'center' ? half : 2), frame.right - (align === 'center' ? half : text.length * 11 + 2))
      drawLabel(ctx, text, px, view.sy(y), { color: colors.ink, halo: colors.surface, size: 11, align })
    }
    name('鞍点', 0, -1.1)
    name('湧き出し', 2, 0.42)
    name('吸い込み', -2, 0.42)
    name('らせん', -1.65, 2.35)
    name('らせん', 1.65, 2.35)
    name('渦心', 0.14, 1.0, 'left')
    drawHandle(ctx, view.sx(point.tr), view.sy(point.det), colors, true)
  })
  drawAxes(ctx, view, {
    colors,
    xLabel: 'tr J',
    yLabel: 'det J',
    xTicks: { step: 2, values: [-2, 0, 2] },
    yTicks: { step: 1, values: [-2, -1, 0, 1, 2, 3] },
  })
}

function drawPortrait(ctx, view, colors, J, info) {
  const bounds = [view.xRange[0], view.yRange[0], view.xRange[1], view.yRange[1]]
  const field = (x, y) => [J[0][0] * x + J[0][1] * y, J[1][0] * x + J[1][1] * y]
  const spacing = Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 9
  const step = spacing / 8 // 1 歩を短くして、原点の近くでも線が乱れにくくする
  const lines = tidyLines(evenlySpacedStreamlines(field, bounds, spacing, { h: step, maxSteps: 800 }), step)
  const origin = [view.sx(0), view.sy(0)]
  clipToFrame(ctx, view, () => {
    // 固有ベクトルの向き(実数の固有値のとき。流れはこの直線の上を通る)
    if (info.real && Math.abs(info.eigenvalues[0].re - info.eigenvalues[1].re) > 1e-6) {
      const axes = [
        { dir: [Math.cos(ANGLE), -Math.sin(ANGLE)], color: laneColor(colors, 1), label: 'λ_1' },
        { dir: [Math.sin(ANGLE), Math.cos(ANGLE)], color: laneColor(colors, 3), label: 'λ_2' },
      ]
      for (const { dir, color, label } of axes) {
        const a = farthestInside(view, origin, dir, 2)
        const b = farthestInside(view, origin, [-dir[0], -dir[1]], 2)
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([7, 5])
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
        ctx.restore()
        const near = farthestInside(view, origin, dir, 16)
        ctx.save()
        ctx.fillStyle = colors.surface
        ctx.beginPath()
        ctx.arc(near[0] + 5, near[1] - 6, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        drawSubLabel(ctx, label, near[0] - 2, near[1] - 3, { color, size: 14 })
      }
    }
    // 流線(向きの矢じりつき)
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    const heads = new Path2D()
    ctx.beginPath()
    for (const line of lines) {
      line.forEach((p, i) => {
        if (i === 0) ctx.moveTo(view.sx(p[0]), view.sy(p[1]))
        else ctx.lineTo(view.sx(p[0]), view.sy(p[1]))
      })
      // 矢じり: 曲線に沿って一定の長さごとに
      let run = 0
      let next = 24
      for (let i = 1; i < line.length; i++) {
        const ax = view.sx(line[i - 1][0])
        const ay = view.sy(line[i - 1][1])
        const bx = view.sx(line[i][0])
        const by = view.sy(line[i][1])
        const length = Math.hypot(bx - ax, by - ay)
        run += length
        if (run >= next && length > 1e-6) {
          const v = field(line[i][0], line[i][1])
          const speed = Math.hypot(v[0], v[1])
          if (speed > 1e-9) addChevron(heads, bx, by, v[0] / speed, -v[1] / speed, 5)
          next = run + 70
        }
      }
    }
    ctx.stroke()
    ctx.stroke(heads)
    // 特異点(原点)の印
    drawCriticalSymbol(ctx, info.type, origin[0], origin[1], colors, 6)
  })
  drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
}

export default function FlowStep6() {
  const point = useRef({ ...START })
  const grabbed = useRef(false)
  const legend = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const { plane, portrait } = layout(width, height)
    const { tr, det } = point.current
    const J = matrixFor(tr, det)
    const info = classifyCriticalPoint(J)
    info.real = Math.abs(info.eigenvalues[0].im) < 1e-9
    drawPlane(ctx, plane, colors, point.current)
    drawPortrait(ctx, portrait, colors, J, info)
    legend.current?.update({
      tr: fmt(tr, 2),
      det: fmt(det, 2),
      eig: eigenText(info.eigenvalues),
      type: `${CRITICAL_MARK[info.type]} ${CRITICAL_LABEL[info.type]}`,
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [redraw])

  const planeNow = () => layout(sizeRef.current.width, sizeRef.current.height).plane
  const insidePlane = (p, view) => p.x >= view.frame.left - HANDLE_R && p.x <= view.frame.right + HANDLE_R && p.y >= view.frame.top - HANDLE_R && p.y <= view.frame.bottom + HANDLE_R
  const setPoint = (tr, det) => {
    // tr = 0 の線(渦心)の近くは、ちょうど 0 に吸い付ける。それ以外は 0.05 刻み
    const t = Math.abs(tr) < 0.12 ? 0 : Math.round(tr * 20) / 20
    point.current = { tr: clamp(t, TR_RANGE[0], TR_RANGE[1]), det: clamp(Math.round(det * 20) / 20, DET_RANGE[0], DET_RANGE[1]) }
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => insidePlane(p, planeNow()),
    onDown: (p) => {
      const view = planeNow()
      if (!insidePlane(p, view)) return false
      grabbed.current = true
      canvasRef.current?.focus({ preventScroll: true })
      setPoint(view.wx(p.x), view.wy(p.y))
      return true
    },
    onMove: ({ x, y }) => {
      const view = planeNow()
      setPoint(view.wx(x), view.wy(y))
    },
    onUp: () => {
      grabbed.current = false
    },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setPoint(point.current.tr + step.dx * 0.1, point.current.det + step.dy * 0.1)
  }
  const reset = () => {
    point.current = { ...START }
    redraw()
  }

  return (
    <SimShell
      label="特異点の分類"
      height={{ phone: [300, 360], pc: [320, 380] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="左は、速度の変わり方を表す行列のトレースと行列式の平面で、点の位置で特異点の種類が決まります。右は、その行列で表される流れの流線です。平面の点をドラッグするか矢印キーで動かせます。" />}
      legend={(
        <SimLegend
          ref={legend}
          items={[
            { key: 'tr', symbol: '\\mathrm{tr}\\,J', label: 'トレース', value: '', minChars: 5 },
            { key: 'det', symbol: '\\det J', label: '行列式', value: '', minChars: 5 },
            { key: 'eig', symbol: '\\lambda', label: '固有値', value: '', minChars: 14 },
            { key: 'type', label: '種類', value: '', minChars: 12 },
          ]}
        />
      )}
      controls={<SimToolbar><ResetButton onClick={reset} /></SimToolbar>}
    />
  )
}
