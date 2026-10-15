import { Suspense } from 'react'
import FormulaList, { SymbolDetails } from './FormulaList'
import CodeExcerpt from './CodeExcerpt'
import LazyMount from './LazyMount'
import { SimPlaceholder } from './SimShell'
import { SimSizeContext } from './SimSizeContext'

// 段階 1 つ(節の steps の要素)。並びは
//   番号と名前 → 説明 → シミュレーション → 式 → 記号の意味(開閉。初めは閉じる)→ 実装を見る(開閉)
// 式が長くても、シミュレーションが画面の下へ押し出されないように、絵を式より前に置く(2026-10-15、画面の確かめで)。
//   step: { id, title, text, formulas: [{ tex, symbols? }], snippets: [名前], Sim }
//   index: 0 始まりの位置(表示する番号は index + 1。組み合わせ(Combination)の steps と同じ番号)
//   sectionId: 節の id(DOM の id は `${sectionId}-step-${番号}`)
// シミュレーション(step.Sim)は、画面に近づいてから作る(LazyMount)。中で SimShell を返せば、
// 自動で段階の大きさ(高さ PC 280〜360px、スマホ 220〜300px)になる。
export function stepDomId(sectionId, number) {
  return `${sectionId}-step-${number}`
}

export default function StepSection({ step, index, sectionId }) {
  const number = index + 1
  const domId = stepDomId(sectionId, number)
  const Sim = step.Sim
  const fallback = <SimPlaceholder label={`${step.title}のシミュレーション`} text="読み込み中" />
  return (
    <section id={domId} className="vis-step" aria-labelledby={`${domId}-title`}>
      <h3 id={`${domId}-title`} tabIndex={-1} className="vis-part__title vis-step__title">
        <span className="vis-step__num" aria-label={`段階 ${number}`}>
          {number}
        </span>
        <span>{step.title}</span>
      </h3>
      {step.text && <p className="vis-step__text">{step.text}</p>}
      {Sim && (
        <SimSizeContext.Provider value="step">
          <LazyMount placeholder={fallback}>
            <Suspense fallback={fallback}>
              <Sim />
            </Suspense>
          </LazyMount>
        </SimSizeContext.Provider>
      )}
      <FormulaList formulas={step.formulas} />
      <SymbolDetails formulas={step.formulas} />
      <CodeExcerpt names={step.snippets} />
    </section>
  )
}
