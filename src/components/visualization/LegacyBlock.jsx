import { useState } from 'react'
import FormulaList from './FormulaList'
import CodeExcerpt from './CodeExcerpt'

// 段階に分ける前の、節の式と実装のまとめ(節のデータの legacyFormulas・legacySnippets)。
// 段階を作る人は、ここから式と抜粋を各段階へ移す。移し終えたら、データの legacy* と、この部品の呼び出しを消す。
// 開くまで中身を作らない(数式の列ぞろえは、見えているあいだに測るため)。
export default function LegacyBlock({ section }) {
  const [open, setOpen] = useState(false)
  const hasFormulas = section.legacyFormulas?.length > 0
  const hasSnippets = section.legacySnippets?.length > 0
  if (!hasFormulas && !hasSnippets) return null
  return (
    <details className="vis-code vis-legacy" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="vis-code__summary">
        <h3 className="vis-legacy__title">この節で使う式と実装のまとめ</h3>
      </summary>
      {open && (
        <div className="vis-legacy__body">
          <FormulaList formulas={section.legacyFormulas} />
          <CodeExcerpt names={section.legacySnippets} />
        </div>
      )}
    </details>
  )
}
