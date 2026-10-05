import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { PiInfoBold } from 'react-icons/pi'
import { glossary } from '../../data/glossary'

const canHover = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches

/**
 * 専門用語。点線の下線と小さなアイコンを付け、短い説明を吹き出しで出す。
 * マウスを乗せる・押す(タップ)・キーボードで移る、のどれでも開く。押すと開いたままになり、
 * もう一度押す・Esc・外側を押すと閉じる。吹き出しは画面の端からはみ出さないように横にずらす。
 */
export default function Term({ children, note }) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)
  const id = useId()
  const rootRef = useRef(null)
  const noteRef = useRef(null)
  const hoverRef = useRef(false)
  const pinnedRef = useRef(false)

  const close = () => {
    pinnedRef.current = false
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  // 画面の端(左右 12px)からはみ出す分だけ、吹き出しを横にずらす
  useLayoutEffect(() => {
    if (!open || !noteRef.current) {
      setShift(0)
      return
    }
    const r = noteRef.current.getBoundingClientRect()
    const right = window.innerWidth - 12
    if (r.right > right) setShift(right - r.right)
    else if (r.left < 12) setShift(12 - r.left)
  }, [open])

  return (
    <span
      ref={rootRef}
      className="term"
      onMouseEnter={() => {
        if (!canHover()) return
        hoverRef.current = true
        setOpen(true)
      }}
      onMouseLeave={() => {
        hoverRef.current = false
        if (!pinnedRef.current) setOpen(false)
      }}
    >
      <button
        type="button"
        className="term__word"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!hoverRef.current && !pinnedRef.current) setOpen(false)
        }}
        onClick={() => {
          pinnedRef.current = !pinnedRef.current
          setOpen(pinnedRef.current || hoverRef.current)
        }}
      >
        {children}
        <PiInfoBold className="term__icon" aria-hidden="true" />
      </button>
      {open && (
        <span ref={noteRef} id={id} role="tooltip" className="term__note" style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
          {note}
        </span>
      )}
    </span>
  )
}

/**
 * 文の中の専門用語を、ページで最初に出たところだけ Term にする。seen はページ全体で1つ(描画のたびに作る)。
 */
export function annotate(text, seen) {
  const parts = []
  let rest = text
  for (;;) {
    let best = null
    for (const entry of glossary) {
      if (seen.has(entry.id)) continue
      for (const word of entry.words) {
        const at = rest.indexOf(word)
        if (at !== -1 && (!best || at < best.at || (at === best.at && word.length > best.word.length))) best = { at, word, entry }
      }
    }
    if (!best) break
    parts.push(rest.slice(0, best.at))
    parts.push(
      <Term key={best.entry.id} note={best.entry.note}>
        {best.word}
      </Term>,
    )
    seen.add(best.entry.id)
    rest = rest.slice(best.at + best.word.length)
  }
  parts.push(rest)
  return parts
}
