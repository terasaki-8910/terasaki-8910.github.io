import { useRef, useState } from 'react'
import { extractSnippet, snippetFile } from './snippets'
import useOverflowFocus from './useOverflowFocus'

// 「実装を見る」。src/utils/vis/*.js の中の「// @snippet 名前」〜「// @end」を、開いたときに読んで等幅で出す。
// ソースは ?raw で読む(手で写さない)ので、テストを通したコードがそのまま見える。ファイルごとに別のチャンクで、
// 開くまで読み込まない。名前は「ファイル名-関数名」(例: 'collide-reflectVelocity')。
//   <CodeExcerpt names={['mat4-multiply', 'projection-perspectiveProject']} />

const loaders = import.meta.glob('../../utils/vis/*.js', { query: '?raw', import: 'default' })

async function loadSnippets(names) {
  const texts = new Map()
  for (const name of names) {
    const file = snippetFile(name)
    if (texts.has(file)) continue
    const loader = loaders[`../../utils/vis/${file}.js`]
    texts.set(file, loader ? await loader() : null)
  }
  return names.map((name) => {
    const file = snippetFile(name)
    const text = texts.get(file)
    return { name, file, code: text ? extractSnippet(text, name) : null }
  })
}

function CodeBlock({ item }) {
  const ref = useRef(null)
  useOverflowFocus(ref)
  return (
    <figure className="vis-code__item">
      <figcaption className="vis-code__caption">utils/vis/{item.file}.js</figcaption>
      {item.code === null ? (
        <p className="vis-code__missing">抜粋「{item.name}」が見つかりません</p>
      ) : (
        <pre ref={ref} className="vis-code__pre" aria-label={`${item.name} のコード`}>
          <code>{item.code}</code>
        </pre>
      )}
    </figure>
  )
}

export default function CodeExcerpt({ names, summary = '実装を見る' }) {
  const [state, setState] = useState({ status: 'idle', items: [] })

  if (!names || names.length === 0) return null

  function onToggle(event) {
    if (!event.currentTarget.open || state.status !== 'idle') return
    setState({ status: 'loading', items: [] })
    loadSnippets(names).then(
      (items) => setState({ status: 'ready', items }),
      () => setState({ status: 'error', items: [] }),
    )
  }

  return (
    <details className="vis-code" onToggle={onToggle}>
      <summary className="vis-code__summary">{summary}</summary>
      <div className="vis-code__body">
        {state.status === 'loading' && <p className="vis-code__status">読み込み中</p>}
        {state.status === 'error' && <p className="vis-code__status">コードを読み込めませんでした</p>}
        {state.status === 'ready' && state.items.map((item) => <CodeBlock key={item.name} item={item} />)}
      </div>
    </details>
  )
}
