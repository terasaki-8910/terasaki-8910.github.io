import { useRef } from 'react'
import Formula from './Formula'
import useOverflowFocus from './useOverflowFocus'

// 式(一般形)と、記号の意味・単位。段階(StepSection)と、段階に分ける前の式のまとめ(LegacyBlock)が使う。
//   formulas: [{ tex, caption?, symbols?: [{ tex, meaning, unit }] }]
//   tex は KaTeX の TeX。symbols の unit も TeX(単位なしは '')

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

export default function FormulaList({ formulas }) {
  if (!formulas?.length) return null
  return (
    <div className="vis-formulas">
      {formulas.map((f, i) => (
        <section key={f.id || i} className="vis-formula" aria-label={f.caption}>
          {f.caption && <h4 className="vis-formula__caption">{f.caption}</h4>}
          <Formula tex={f.tex} display />
          {f.symbols?.length > 0 && <SymbolTable symbols={f.symbols} />}
        </section>
      ))}
    </div>
  )
}
