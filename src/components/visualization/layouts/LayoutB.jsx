import { LayoutContext } from '../LayoutContext'
import { SectionHead, SectionFormulas, SectionSim, SectionCode, SectionSources } from '../SectionParts'

// 案 B「実験台」: 1024px 以上で2列。左(7/12)にシミュレーションと操作を sticky で置き、
// 右(5/12)で説明と式が流れる。狭い画面は 見出しと説明 → シミュレーション → 式 の順に縦に積む。
const CONTEXT = { layout: 'b', placement: 'below', aside: null }

export default function LayoutB({ sections }) {
  return (
    <LayoutContext.Provider value={CONTEXT}>
      <div className="vis-b-wrap">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="vis-section vis-b" aria-labelledby={`${section.id}-heading`}>
            <div className="vis-b__head">
              <SectionHead section={section} headingId={`${section.id}-heading`} />
            </div>
            <div className="vis-b__sim">
              <SectionSim section={section} />
            </div>
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
