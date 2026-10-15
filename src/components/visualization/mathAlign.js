// 数式の表(KaTeX の aligned・pmatrix は columnalign 付きの mtable になる)の列ぞろえを補う。
// Chromium の MathML Core は columnalign を読まず、CSS の text-align もセルの中では center しか効かない
// (right や end を指定すると左に寄る。auto の余白も数式の中では効かない)。そこでセルはいつも中央ぞろえにし
// (visualization.css)、組んだあとに列ごとの最大の幅を測って、右ぞろえの列は左に、左ぞろえの列は右に
// 詰め物(padding)を足す。中身の箱が中身の幅ちょうどになるので、中央に置けば右・左の位置に来る。
// columnalign を読むブラウザ(Safari、Firefox)でも、同じ詰め物で同じ位置になる(2026-10-15)
export function alignMathColumns(root) {
  if (!root) return
  // 内側の表(行列)を先にそろえる。外側の列の幅は内側の幅で決まるため
  const tables = [...root.querySelectorAll('mtable[columnalign]')].reverse()
  for (const table of tables) {
    const aligns = table.getAttribute('columnalign').trim().split(/\s+/)
    const alignOf = (j) => aligns[Math.min(j, aligns.length - 1)]
    const cells = [...table.children]
      .filter((r) => r.localName === 'mtr')
      .map((r) => [...r.children].filter((c) => c.localName === 'mtd'))
    for (const row of cells) for (const td of row) td.style.paddingLeft = td.style.paddingRight = ''
    const width = (td) => (td.firstElementChild ? td.firstElementChild.getBoundingClientRect().width : 0)
    const colMax = []
    cells.forEach((row) => row.forEach((td, j) => { colMax[j] = Math.max(colMax[j] || 0, width(td)) }))
    cells.forEach((row) => row.forEach((td, j) => {
      const gap = colMax[j] - width(td)
      if (gap < 0.5) return
      const cs = getComputedStyle(td)
      const pl = parseFloat(cs.paddingLeft) || 0
      const pr = parseFloat(cs.paddingRight) || 0
      const a = alignOf(j)
      // 中央の列も詰め物で作る(行列の中のセルでは、中央ぞろえの指定が効かないことがある)
      const left = a === 'right' ? gap : a === 'center' ? gap / 2 : 0
      td.style.paddingLeft = `${pl + left}px`
      td.style.paddingRight = `${pr + gap - left}px`
    }))
  }
}
