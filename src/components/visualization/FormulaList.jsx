import { useRef, useState } from 'react'
import Formula from './Formula'
import useOverflowFocus from './useOverflowFocus'

// 式(一般形)と、記号の意味・単位。段階(StepSection)が使う。式は FormulaList で出し、記号の表は SymbolDetails で
// 開閉の欄(初めは閉じる)にまとめる。式が長くても、シミュレーションを画面の下へ押し出さないため。
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

// 式の並び(記号の表は出さない)
export default function FormulaList({ formulas }) {
  if (!formulas?.length) return null
  return (
    <div className="vis-formulas">
      {formulas.map((f, i) => (
        <section key={f.id || i} className="vis-formula" aria-label={f.caption}>
          {f.caption && <h4 className="vis-formula__caption">{f.caption}</h4>}
          <Formula tex={f.tex} display />
        </section>
      ))}
    </div>
  )
}

// 段階の式すべての記号を 1 つの表にまとめる(同じ記号は最初の 1 つだけ)
export function collectSymbols(formulas) {
  const seen = new Set()
  const out = []
  for (const f of formulas ?? []) {
    for (const s of f.symbols ?? []) {
      if (seen.has(s.tex)) continue
      seen.add(s.tex)
      out.push(s)
    }
  }
  return out
}

// 「記号の意味」: 開閉の欄。初めは閉じる。開くまで表を作らない(行内の数式の測りは、見えているあいだにするため)
export function SymbolDetails({ formulas, summary = '記号の意味' }) {
  const [open, setOpen] = useState(false)
  const symbols = collectSymbols(formulas)
  if (symbols.length === 0) return null
  return (
    <details className="vis-code vis-symbols-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="vis-code__summary">{summary}</summary>
      {open && <SymbolTable symbols={symbols} />}
    </details>
  )
}
