import { Suspense } from 'react'
import { SimPlaceholder } from './SimShell'
import StepSection from './StepSection'
import Combination from './Combination'
import LegacyBlock from './LegacyBlock'
import Sources from './Sources'

// タブ 1 つの中身(sections/<id>.js のデータ)。並びは
//   見出しと 1〜2 文 → 全体(シミュレーションと、一言の説明)→ 段階 1〜N → 組み合わせ → 出典
// 段階が空(steps: [])のあいだは、段階と組み合わせの欄は出さない。
export default function SectionPanel({ section, headingId }) {
  const { overview, steps = [] } = section
  const Sim = overview?.Sim
  const overviewLabel = `${section.title}の全体のシミュレーション`
  const fallback = <SimPlaceholder label={overviewLabel} />
  return (
    <>
      <header className="vis-head">
        <h2 id={headingId} className="vis-head__title">{section.title}</h2>
        <p className="vis-head__text">{section.intro}</p>
      </header>
      <section className="vis-overview" aria-labelledby={`${section.id}-overview-title`}>
        <h3 id={`${section.id}-overview-title`} className="vis-part__title">全体</h3>
        {Sim ? (
          <Suspense fallback={fallback}>
            <Sim />
          </Suspense>
        ) : (
          fallback
        )}
        {overview?.caption && <p className="vis-caption">{overview.caption}</p>}
      </section>
      <LegacyBlock section={section} />
      {steps.map((step, i) => (
        <StepSection key={step.id} step={step} index={i} sectionId={section.id} />
      ))}
      {steps.length > 0 && (
        <Combination
          combination={section.combination}
          sectionId={section.id}
          headingId={`${section.id}-combination-title`}
        />
      )}
      <Sources sources={section.sources} />
    </>
  )
}
