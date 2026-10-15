import { useEffect, useRef, useState } from 'react'
import { LayoutContext } from '../LayoutContext'
import { SectionHead, SectionFormulas, SectionSim, SectionCode, SectionSources } from '../SectionParts'

// 案 B「実験台」: 1024px 以上で2列。左(7/12)にシミュレーションと操作を sticky で置き、
// 右(5/12)で説明と式が流れる。狭い画面は 見出しと説明 → シミュレーション → 式 の順に縦に積む。
const CONTEXT = { layout: 'b', placement: 'below' }

// 左の欄は、画面に収まるときだけ sticky にする。画面より高い(変換の節のスライダーは 10 本)と、sticky のままでは
// 下のほうが画面の外に固定されて、スクロールしても操作に届かない。収まらないときは、普通に流す。
const STICKY_TOP_REM = 5.5

function StickySim({ children }) {
  const ref = useRef(null)
  const [fits, setFits] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      // sticky の top(visualization.css の .vis-b__sim と同じ 5.5rem)。要素の top の計算値は、sticky を外すと
      // auto になって 0 に変わり、収まる・収まらないが行き来してしまうので、rem から求める
      const top = STICKY_TOP_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
      setFits(el.offsetHeight + top + 16 <= window.innerHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return (
    <div ref={ref} className="vis-b__sim" data-fits={fits}>
      {children}
    </div>
  )
}

export default function LayoutB({ sections }) {
  return (
    <LayoutContext.Provider value={CONTEXT}>
      <div className="vis-b-wrap">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="vis-section vis-b" aria-labelledby={`${section.id}-heading`}>
            <div className="vis-b__head">
              <SectionHead section={section} headingId={`${section.id}-heading`} />
            </div>
            <StickySim>
              <SectionSim section={section} />
            </StickySim>
            <div className="vis-b__body">
              <SectionFormulas section={section} />
              <SectionCode section={section} />
              <SectionSources section={section} />
            </div>
          </section>
        ))}
      </div>
    </LayoutContext.Provider>
  )
}
