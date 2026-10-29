import { useEffect, useRef, useState } from 'react'
import SimCanvas from '../../visualization/SimCanvas'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, markerCircle } from '../../visualization/sims/rigidKit'
import { colorRamp, VOLUME_HISTOGRAM } from './volumeKit'
import { describePoint, movePoint, tfKeyAction } from './tfEditorKit'
import { clampIndex } from './volumeKeys'

const MARGIN = { left: 16, right: 12, top: 8, bottom: 22 }

const DEFAULT_LABEL = '伝達関数のグラフ。横軸は体積データの値、縦軸は不透明度で、値の分布の棒と、値に対応する色の帯が付く。点をドラッグして値と不透明度を動かせる。PageUp・PageDown で点を選び、矢印キーで動かす（Shift で 5 倍）。Home・End で両端の点を選ぶ'

export default function TransferFunctionEditor({ points, onChange, label = DEFAULT_LABEL }) {
  const [selected, setSelected] = useState(0)
  // プリセットの切り替えで点の数が減っても、選んでいる番号が範囲の外を指さないようにする(描画もキー操作もこの番号を使う)
  const index = clampIndex(selected, points.length)
  const selectedRef = useRef(index)
  selectedRef.current = index
  const pointsRef = useRef(points)
  pointsRef.current = points
  const live = useRef(null)
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  // 点の数が変わったら、state の選びもその範囲に収める(あとで点が増えたときに、古い大きな番号が戻ってこないように)
  useEffect(() => {
    setSelected((value) => clampIndex(value, points.length))
  }, [points.length])

  const layout = (width, height) => ({
    left: MARGIN.left,
    right: width - MARGIN.right,
    top: MARGIN.top,
    bottom: height - MARGIN.bottom,
    sx: (value) => MARGIN.left + value * (width - MARGIN.left - MARGIN.right),
    sy: (alpha) => height - MARGIN.bottom - alpha * (height - MARGIN.top - MARGIN.bottom),
  })
  const draw = ({ ctx, width, height, colors }) => {
    const box = layout(width, height)
    ctx.save()
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const max = Math.max(...VOLUME_HISTOGRAM)
    const barW = (box.right - box.left) / VOLUME_HISTOGRAM.length
    ctx.fillStyle = colors.alpha('muted', 0.32)
    VOLUME_HISTOGRAM.forEach((count, i) => {
      const h = (count / max) * (box.bottom - box.top)
      ctx.fillRect(box.left + i * barW, box.bottom - h, Math.max(1, barW), h)
    })
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    pointsRef.current.forEach((point, i) => {
      if (i === 0) ctx.moveTo(box.sx(point.value), box.sy(point.alpha))
      else ctx.lineTo(box.sx(point.value), box.sy(point.alpha))
    })
    ctx.stroke()
    pointsRef.current.forEach((point, i) => markerCircle(ctx, box.sx(point.value), box.sy(point.alpha), 6, {
      fill: colors.accent,
      stroke: colors.ink,
      lineWidth: i === selectedRef.current ? 3 : 1.5,
    }))
    const stripY = height - 13
    for (let x = Math.floor(box.left); x < box.right; x++) {
      const c = colorRamp(colors, (x - box.left) / (box.right - box.left))
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`
      ctx.fillRect(x, stripY, 2, 7)
    }
    ctx.strokeStyle = colors.muted // line は半透明で薄いので、意味のある枠には使わない
    ctx.lineWidth = 1
    ctx.strokeRect(box.left, stripY, box.right - box.left, 7)
    ctx.restore()
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [points, index])

  const hit = (position) => {
    const box = layout(sizeRef.current.width, sizeRef.current.height)
    let best = -1
    let distance = 7 + GRAB_SLOP_PX
    pointsRef.current.forEach((point, i) => {
      const d = Math.hypot(position.x - box.sx(point.value), position.y - box.sy(point.alpha))
      if (d <= distance) { best = i; distance = d }
    })
    return best
  }
  const move = (target, x, y) => {
    const box = layout(sizeRef.current.width, sizeRef.current.height)
    const next = movePoint(pointsRef.current, target, {
      value: (x - box.left) / (box.right - box.left),
      alpha: (box.bottom - y) / (box.bottom - box.top),
    })
    if (next !== pointsRef.current) onChange(next)
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => hit(position) >= 0,
    onDown: (position) => {
      const i = hit(position)
      if (i < 0) return false
      selectedRef.current = i // 再描画を待たずに、つかんだ点を動かす
      setSelected(i)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      move(i, position.x, position.y)
      return true
    },
    onMove: (position) => move(selectedRef.current, position.x, position.y),
  })
  const onKeyDown = (event) => {
    const result = tfKeyAction(pointsRef.current, selectedRef.current, event)
    if (!result) return
    event.preventDefault()
    if (result.selected !== selectedRef.current) {
      selectedRef.current = result.selected
      setSelected(result.selected)
    }
    if (result.points !== pointsRef.current) onChange(result.points)
    announce(describePoint(result.points, result.selected))
  }
  return (
    <>
      <SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label={label} />
      <span className="sr-only" role="status" aria-live="polite" ref={live} />
    </>
  )
}
