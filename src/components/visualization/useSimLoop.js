import { useCallback, useEffect, useRef, useState } from 'react'

// シミュレーションの時間を進める rAF のループ。
//   const loop = useSimLoop((dt, t) => { step(dt); redraw() }, { targetRef: canvasRef })
//   loop.running / loop.toggle() / loop.play() / loop.pause()
// 動くのは「利用者が再生中」かつ「targetRef の要素が画面に見えている」かつ「タブが見えている」ときだけ。
// 画面外の節や隠れたタブでは rAF を止める。dt は秒で、長い間隔(タブの復帰直後など)は MAX_FRAME_DT に切る。
// 最初のフレームの dt は 0。「動きを減らす」設定のときは止めた状態で始まる(再生ボタンで動かせる)。
// 開始と終了は effect の中で対になっているので、StrictMode で二重に走っても rAF は1本だけ残る。

const MAX_FRAME_DT = 0.1

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function useSimLoop(onFrame, { targetRef, autoStart = true } = {}) {
  const [running, setRunning] = useState(() => autoStart && !prefersReducedMotion())
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame

  // 画面に見えているか(見えるまで止めておく。見えた最初の通知は次のフレームまでに来る)
  useEffect(() => {
    const el = targetRef?.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [targetRef])

  // タブが隠れたら止める
  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // 「動きを減らす」に切り替わったら、動いていても止める
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const onChange = (event) => {
      if (event.matches) setRunning(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const active = running && inView && pageVisible
  useEffect(() => {
    if (!active) return undefined
    let raf = 0
    let last = null
    let t = 0
    const tick = (now) => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_DT)
      last = now
      t += dt
      frameRef.current(dt, t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const play = useCallback(() => setRunning(true), [])
  const pause = useCallback(() => setRunning(false), [])
  const toggle = useCallback(() => setRunning((r) => !r), [])

  // active: 実際に rAF が回っているか(画面外やタブが隠れているときは running でも false)
  return { running, active, play, pause, toggle, setRunning }
}
