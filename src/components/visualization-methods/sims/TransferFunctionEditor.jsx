import { useEffect, useRef, useState } from 'react'
import SimCanvas from '../../visualization/SimCanvas'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { colorRamp, VOLUME_HISTOGRAM } from './volumeKit'

const MARGIN = { left: 16, right: 12, top: 8, bottom: 22 }

export default function TransferFunctionEditor({ points, onChange, label = '伝達関数。点をドラッグし、矢印キーで値と不透明度を変更' }) {
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const pointsRef = useRef(points)
  pointsRef.current = points

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
    ctx.strokeStyle = colors.line
    ctx.strokeRect(box.left, stripY, box.right - box.left, 7)
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [points, selected])

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
  const move = (index, x, y) => {
    const box = layout(sizeRef.current.width, sizeRef.current.height)
    const next = pointsRef.current.map((point) => ({ ...point }))
    const low = index === 0 ? 0 : next[index - 1].value + 0.01
    const high = index === next.length - 1 ? 1 : next[index + 1].value - 0.01
    next[index].value = clamp((x - box.left) / (box.right - box.left), low, high)
    next[index].alpha = clamp((box.bottom - y) / (box.bottom - box.top), 0, 1)
    next[index].t = next[index].value
    onChange(next)
  }
  usePointerDrag(canvasRef, {
    canGrab: (position) => hit(position) >= 0,
    onDown: (position) => { const i = hit(position); if (i < 0) return false; setSelected(i); move(i, position.x, position.y); return true },
    onMove: (position) => move(selectedRef.current, position.x, position.y),
  })
  const onKeyDown = (event) => {
    if (event.key === 'Tab') {
      const next = selectedRef.current + (event.shiftKey ? -1 : 1)
      if (next >= 0 && next < points.length) {
        event.preventDefault()
        setSelected(next)
      }
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      setSelected((value) => (value + (event.key === 'PageUp' ? -1 : 1) + points.length) % points.length)
      return
    }
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    const next = points.map((point) => ({ ...point }))
    const i = selectedRef.current
    const amount = event.shiftKey ? 0.05 : 0.01
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next[i].alpha = clamp(next[i].alpha + (event.key === 'ArrowUp' ? amount : -amount), 0, 1)
    else {
      const low = i === 0 ? 0 : next[i - 1].value + 0.01
      const high = i === next.length - 1 ? 1 : next[i + 1].value - 0.01
      next[i].value = clamp(next[i].value + (event.key === 'ArrowRight' ? amount : -amount), low, high)
      next[i].t = next[i].value
    }
    onChange(next)
  }
  return <SimCanvas ref={canvasRef} height={120} tabIndex={0} onKeyDown={onKeyDown} label={label} />
}
