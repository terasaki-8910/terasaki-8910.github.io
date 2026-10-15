import { LayoutContext } from '../LayoutContext'
import { SectionHead, SectionFormulas, SectionSim, SectionCode, SectionSources } from '../SectionParts'

// 案 A「読み物」: 1列(max-w-3xl)。節ごとに 説明 → 式 → シミュレーション(列の幅いっぱい)→ 実装を見る → 出典。
const CONTEXT = { layout: 'a', placement: 'below' }

export default function LayoutA({ sections }) {
  return (
    <LayoutContext.Provider value={CONTEXT}>
      <div className="vis-a">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="vis-section" aria-labelledby={`${section.id}-heading`}>
            <SectionHead section={section} headingId={`${section.id}-heading`} />
            <SectionFormulas section={section} />
            <SectionSim section={section} />
            <SectionCode section={section} />
            <SectionSources section={section} />
          </section>
        ))}
      </div>
    </LayoutContext.Provider>
  )
}
