import { useRef } from 'react'
import katex from 'katex'
import useOverflowFocus from './useOverflowFocus'

// 数式を MathML で出す(KaTeX の output: 'mathml')。KaTeX の CSS とフォントは読まない。
// 字形はブラウザが OS の数式フォント(font-family: math)で描くので、サイトのフォントは増えない
// (visualization.css の .vis-math)。tex は書き手(このリポジトリ)が書く文字列だけ。利用者の入力は渡さない。
//   <Formula tex="E = mc^2" />       行内
//   <Formula tex="..." display />    ブロック(横にはみ出すときは横にスクロール。そのときだけフォーカスを受ける)

const cache = new Map()

function render(tex, display) {
  const key = (display ? 'd:' : 'i:') + tex
  let html = cache.get(key)
  if (html === undefined) {
    html = katex.renderToString(tex, {
      output: 'mathml',
      displayMode: display,
      throwOnError: false,
      strict: false,
    })
    cache.set(key, html)
  }
  return html
}

export default function Formula({ tex, display = false, className = '' }) {
  const ref = useRef(null)
  useOverflowFocus(ref) // 行内では ref を付けないので何もしない
  const html = render(tex, display)
  if (display) {
    return (
      <div
        ref={ref}
        className={`vis-math vis-math--block ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return <span className={`vis-math ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
