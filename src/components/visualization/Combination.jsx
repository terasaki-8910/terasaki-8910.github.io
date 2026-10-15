import { stepDomId } from './StepSection'

// 組み合わせ: 段階のどれが全体のどこに当たるかを、短い文と順番の一覧で見せる。
//   combination: { text?: 全体を作る順番を 1〜2 文で,
//                  flow: [{ steps: [1], text: '力を求める' }, { steps: [2, 3], text: '速度と位置を進める' }, ...] }
//   steps は段階の番号(1 始まり。StepSection の番号と同じ)。番号を押すと、その段階へ移る。
function goToStep(sectionId, number) {
  const el = document.getElementById(stepDomId(sectionId, number))
  if (!el) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  el.querySelector('h3')?.focus({ preventScroll: true })
}

export default function Combination({ combination, sectionId, headingId }) {
  if (!combination?.flow?.length) return null
  return (
    <section className="vis-combo" aria-labelledby={headingId}>
      <h3 id={headingId} className="vis-part__title">組み合わせると全体になる</h3>
      {combination.text && <p className="vis-combo__text">{combination.text}</p>}
      <ol className="vis-combo__list">
        {combination.flow.map((item, i) => (
          <li key={i} className="vis-combo__item">
            <span className="vis-combo__steps">
              {item.steps.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="vis-combo__chip"
                  aria-label={`段階 ${n} へ移る`}
                  onClick={() => goToStep(sectionId, n)}
                >
                  {n}
                </button>
              ))}
            </span>
            <span className="vis-combo__label">{item.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
