import { Suspense, useRef } from 'react'
import Formula from './Formula'
import CodeExcerpt from './CodeExcerpt'
import { SimPlaceholder } from './SimShell'
import useOverflowFocus from './useOverflowFocus'

// 節(sections/<id>.js のデータ)を画面にする部品。3つの案(layouts/)が、これを並べ方だけ変えて使う。

// h2 と 2〜4 文の説明
export function SectionHead({ section, headingId }) {
  return (
    <header className="vis-head">
      <h2 id={headingId} className="vis-head__title">{section.title}</h2>
      <p className="vis-head__text">{section.description}</p>
    </header>
  )
}

function SymbolTable({ symbols }) {
  const ref = useRef(null)
  useOverflowFocus(ref)
  return (
    <div ref={ref} className="vis-symbols">
      <table>
        <thead>
          <tr>
            <th scope="col">記号</th>
            <th scope="col">意味</th>
            <th scope="col">単位</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((s) => (
            <tr key={s.tex}>
              <th scope="row"><Formula tex={s.tex} /></th>
              <td>{s.meaning}</td>
              <td>{s.unit ? <Formula tex={s.unit} /> : <><span aria-hidden="true">–</span><span className="sr-only">なし</span></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 式(一般形)と、記号の意味・単位
export function SectionFormulas({ section }) {
  if (!section.formulas?.length) return null
  return (
    <div className="vis-formulas">
      {section.formulas.map((f) => (
        <section key={f.id} className="vis-formula" aria-label={f.caption}>
          <h3 className="vis-formula__caption">{f.caption}</h3>
          <Formula tex={f.tex} display />
          {f.symbols?.length > 0 && <SymbolTable symbols={f.symbols} />}
        </section>
      ))}
    </div>
  )
}

// シミュレーション。データに Sim があればそれ、なければ空の枠
export function SectionSim({ section }) {
  const Sim = section.Sim
  if (!Sim) return <SimPlaceholder label={`${section.title}のシミュレーション`} />
  return (
    <Suspense fallback={<SimPlaceholder label={`${section.title}のシミュレーション`} />}>
      <Sim />
    </Suspense>
  )
}

export function SectionCode({ section }) {
  return <CodeExcerpt names={section.snippets} />
}

export function SectionSources({ section }) {
  if (!section.sources?.length) return null
  return (
    <div className="vis-sources">
      <h3 className="vis-sources__title">出典</h3>
      <ul>
        {section.sources.map((s) => (
          <li key={s.text}>
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a>
            ) : (
              s.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
