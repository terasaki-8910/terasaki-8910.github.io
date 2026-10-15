import { useEffect, useRef, useState } from 'react'

// 画面に近づいてから子を作る(段階のシミュレーションを、読み込みの時点で何十個も作らないため)。
// 近づく = 画面の端から rootMargin(300px)以内。一度作ったら、離れても作ったまま(止めるのは useSimLoop の役目:
// 画面外とタブの外では rAF が止まる)。IntersectionObserver がない環境では、すぐ作る。
//   <LazyMount placeholder={<SimPlaceholder />}> <Sim /> </LazyMount>
export default function LazyMount({ children, placeholder = null, rootMargin = '300px' }) {
  const ref = useRef(null)
  const [mounted, setMounted] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (mounted) return undefined
    const el = ref.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted, rootMargin])

  return (
    <div ref={ref} className="vis-lazy">
      {mounted ? children : placeholder}
    </div>
  )
}
