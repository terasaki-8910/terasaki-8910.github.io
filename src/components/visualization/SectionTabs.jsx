import { useEffect, useRef, useState } from 'react'
import SectionPanel from './SectionPanel'

// 5 つの節をタブで 1 つずつ見せる(role=tablist、矢印キーと Home・End で移る)。
// 1 度に出すのは 1 つの節だけ。ほかの節のシミュレーションは作られないので動かない。
// 節の id は URL の # に反映する(# だけが変わる移動 — 戻る・同じタブでリンクを開く — にもタブを合わせる)。

function initialId(sections) {
  const hash = typeof location !== 'undefined' ? location.hash.slice(1) : ''
  return sections.some((s) => s.id === hash) ? hash : sections[0].id
}

export default function SectionTabs({ sections }) {
  const [activeId, setActiveId] = useState(() => initialId(sections))
  const tabRefs = useRef([])
  const index = Math.max(0, sections.findIndex((s) => s.id === activeId))
  const section = sections[index]

  useEffect(() => {
    const onHashChange = () => setActiveId(initialId(sections))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [sections])

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
    <div className="vis-tabs-wrap">
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
        className="vis-panel"
      >
        <SectionPanel section={section} headingId={section.id} />
      </section>
    </div>
  )
}
