import { useEffect, useRef, useState } from 'react'

const MIN = 1
const MAX = 4
const DOUBLE_TAP_MS = 300
const clampScale = (s) => Math.min(MAX, Math.max(MIN, s))
// 動きを減らす設定の人には、動く画像(README のデモ)の代わりに静止画を出す
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * 画像を大きく見る。外側・Esc・× で閉じ、閉じたら押した画像にフォーカスを戻す。開いている間は後ろをスクロールしない。
 * 拡大・縮小(確認シート16回目 R16-2「スマホだと見にくいので、上下スワイプなどで拡大縮小できるように」):
 *   スマホ … 2本指でつまむ・ダブルタップ・等倍のときは1本指で上下に動かす(上で拡大、下で縮小)。拡大中は1本指で動かせる
 *   PC   … ホイール・ダブルクリック・拡大中はドラッグで動かせる。キーボードは + と - と 0(元の大きさ)
 */
export default function ShotViewer({ shot, onClose }) {
  const closeRef = useRef(null)
  const imgRef = useRef(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  // 移動は、拡大した分だけ(画像が画面の外へ飛んでいかないように)
  const clampView = (scale, x, y) => {
    const img = imgRef.current
    if (!img) return { scale, x, y }
    const maxX = ((scale - 1) * img.offsetWidth) / 2
    const maxY = ((scale - 1) * img.offsetHeight) / 2
    return { scale, x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }
  // 画像の中心(拡大前の位置)から見た、画面上の点の位置
  const fromCenter = (clientX, clientY) => {
    const r = imgRef.current.getBoundingClientRect()
    const v = viewRef.current
    return { x: clientX - (r.left + r.width / 2) + v.x, y: clientY - (r.top + r.height / 2) + v.y }
  }
  // 指やカーソルの下の点を動かさずに、倍率を変える
  const zoomAt = (nextScale, clientX, clientY) => {
    const v = viewRef.current
    const s = clampScale(nextScale)
    const p = fromCenter(clientX, clientY)
    const k = s / v.scale
    setView(clampView(s, p.x - k * (p.x - v.x), p.y - k * (p.y - v.y)))
  }

  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 })
    pointers.current.clear()
    gesture.current = null
  }, [shot])

  useEffect(() => {
    if (!shot) return undefined
    const before = document.activeElement
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (event.key === '+' || event.key === '=') zoomAt(viewRef.current.scale * 1.5, cx, cy)
      if (event.key === '-') zoomAt(viewRef.current.scale / 1.5, cx, cy)
      if (event.key === '0') setView({ scale: 1, x: 0, y: 0 })
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      html.style.overflow = overflow
      before?.focus?.()
    }
    // zoomAt は view を ref で読むので、依存に入れなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, onClose])

  if (!shot) return null

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const v = viewRef.current
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const [a, b] = pts
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: v.scale, t0: { x: v.x, y: v.y }, m0: fromCenter(mid.x, mid.y) }
    } else if (pts.length === 1) {
      gesture.current = { kind: v.scale > 1 ? 'pan' : 'swipe', p0: { x: event.clientX, y: event.clientY }, s0: v.scale, t0: { x: v.x, y: v.y }, f0: fromCenter(event.clientX, event.clientY), moved: false }
    }
  }
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const s = clampScale((g.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0)
      const mid = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2)
      const k = s / g.s0
      setView(clampView(s, mid.x - k * (g.m0.x - g.t0.x), mid.y - k * (g.m0.y - g.t0.y)))
      return
    }
    const dx = event.clientX - g.p0.x
    const dy = event.clientY - g.p0.y
    if (Math.hypot(dx, dy) > 6) g.moved = true
    if (g.kind === 'pan') {
      setView(clampView(g.s0, g.t0.x + dx, g.t0.y + dy))
    } else if (g.kind === 'swipe' && event.pointerType !== 'mouse' && g.moved) {
      // 等倍のときの上下の動き: 上へ動かすと拡大、下へ動かすと縮小(押し始めた点を中心に)
      const s = clampScale(g.s0 * Math.exp(-dy / 200))
      const k = s / g.s0
      setView(clampView(s, g.f0.x - k * (g.f0.x - g.t0.x), g.f0.y - k * (g.f0.y - g.t0.y)))
    }
  }
  const onPointerUp = (event) => {
    const g = gesture.current
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 1 && g?.kind === 'pinch') {
      // 2本指のうち1本を離したら、残りの指で動かせるようにする
      const [p] = [...pointers.current.values()]
      const v = viewRef.current
      gesture.current = { kind: v.scale > 1 ? 'pan' : 'swipe', p0: p, s0: v.scale, t0: { x: v.x, y: v.y }, f0: fromCenter(p.x, p.y), moved: true }
      return
    }
    if (pointers.current.size > 0) return
    gesture.current = null
    // ダブルタップ・ダブルクリック: 拡大していれば元に戻し、等倍なら2.5倍に
    if (g && !g.moved && g.kind !== 'pinch') {
      const now = Date.now()
      const last = lastTap.current
      if (now - last.t < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
        if (viewRef.current.scale > 1) setView({ scale: 1, x: 0, y: 0 })
        else zoomAt(2.5, event.clientX, event.clientY)
        lastTap.current = { t: 0, x: 0, y: 0 }
      } else {
        lastTap.current = { t: now, x: event.clientX, y: event.clientY }
      }
    }
  }
  const onWheel = (event) => {
    zoomAt(viewRef.current.scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
  }

  // スマホで拡大・移動した直後は、Chrome が次の1回のタップの click を出さない(慣性スクロールを止めるタップとして扱う)。
  // × と外側は、指を離したとき(touchend)に閉じる。preventDefault で後から来る click を止め、閉じた後ろの要素(右上のメニューなど)を押させない
  const closeOnTouch = (event) => {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      className="shot-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={shot.alt}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      onTouchEnd={closeOnTouch}
      onWheel={onWheel}
    >
      <img
        ref={imgRef}
        src={(reduceMotion() && (shot.fullStill || shot.still)) || shot.full || shot.src}
        alt={shot.alt}
        className="shot-viewer__img"
        data-zoomed={view.scale > 1 ? 'true' : 'false'}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <button ref={closeRef} type="button" className="shot-viewer__close" aria-label="閉じる" onClick={onClose} onTouchEnd={closeOnTouch}>
        ×
      </button>
    </div>
  )
}
