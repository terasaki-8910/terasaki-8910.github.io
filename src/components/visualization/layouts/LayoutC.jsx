import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutContext } from '../LayoutContext'
import { SectionHead, SectionFormulas, SectionSim, SectionCode, SectionSources } from '../SectionParts'

// 案 C「タブ」: 上に4つのタブ(role=tablist、矢印キーで移る)。1度に1節だけ出す(ほかの節のシミュレーションは
// 作られないので動かない)。1024px 以上では、シミュレーションを大きく、操作と式を右の欄に置く
// (式は SimShell が操作の下に出す。LayoutContext の aside)。節の id は URL の # に反映する。

function initialId(sections) {
  const hash = typeof location !== 'undefined' ? location.hash.slice(1) : ''
  return sections.some((s) => s.id === hash) ? hash : sections[0].id
}

export default function LayoutC({ sections }) {
  const [activeId, setActiveId] = useState(() => initialId(sections))
  const tabRefs = useRef([])
  const index = Math.max(0, sections.findIndex((s) => s.id === activeId))
  const section = sections[index]

  // # だけが変わる移動(リンクを同じタブで開く、戻るなど)にもタブを合わせる
  useEffect(() => {
    const onHashChange = () => setActiveId(initialId(sections))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [sections])

  const context = useMemo(
    () => ({ layout: 'c', placement: 'side', aside: <SectionFormulas section={section} /> }),
    [section],
  )

  function select(i, focus = false) {
    const n = (i + sections.length) % sections.length
    setActiveId(sections[n].id)
    history.replaceState(null, '', `${location.pathname}${location.search}#${sections[n].id}`)
    if (focus) tabRefs.current[n]?.focus()
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowRight') select(index + 1, true)
    else if (event.key === 'ArrowLeft') select(index - 1, true)
    else if (event.key === 'Home') select(0, true)
    else if (event.key === 'End') select(sections.length - 1, true)
    else return
    event.preventDefault()
  }

  return (
    <LayoutContext.Provider value={context}>
      <div className="vis-c">
        <div className="vis-tabs" role="tablist" aria-label="節" onKeyDown={onKeyDown}>
          {sections.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => (tabRefs.current[i] = el)}
              id={`${s.id}-tab`}
              type="button"
              role="tab"
              className="vis-tab"
              aria-selected={s.id === section.id}
              aria-controls={`${s.id}-panel`}
              tabIndex={s.id === section.id ? 0 : -1}
              onClick={() => select(i)}
            >
              {s.tabLabel || s.title}
            </button>
          ))}
        </div>
        <section
          key={section.id}
          id={`${section.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${section.id}-tab`}
          className="vis-c__panel"
        >
          <SectionHead section={section} headingId={section.id} />
          <SectionSim section={section} />
          <SectionCode section={section} />
          <SectionSources section={section} />
        </section>
      </div>
    </LayoutContext.Provider>
  )
}
