// 段階(StepSection)の並び: 番号と名前 → 説明 → シミュレーション → 式 → 記号の意味(開閉・初めは閉じる)→ 実装を見る。
// 実行: node --test "tests/vis-page/*.test.js"
// StepSection は JSX なので、esbuild でまとめて読む。CodeExcerpt は import.meta.glob(vite だけ)を使うので差し替える。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VIS = join(ROOT, 'src/components/visualization')

const stubCode = {
  name: 'stub-code-excerpt',
  setup(b) {
    b.onResolve({ filter: /CodeExcerpt$/ }, (args) => ({ path: args.path, namespace: 'stub-code' }))
    b.onLoad({ filter: /.*/, namespace: 'stub-code' }, () => ({
      loader: 'jsx',
      resolveDir: VIS,
      contents: "export default function CodeExcerpt({ names }) { return names?.length ? <details className='vis-code'><summary>実装を見る</summary></details> : null }",
    }))
  },
}

let mod
let dir
before(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import StepSection from './StepSection.jsx'
        import { collectSymbols } from './FormulaList.jsx'
        export { StepSection, collectSymbols, renderToStaticMarkup, React }
      `,
      resolveDir: VIS,
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [stubCode],
    // react・react-dom・katex も含めてまとめる(data: URL からは bare import が解決できないため)。CJS の require を使えるようにする
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  })
  // 一時フォルダに書いて読む(使い終わったら消す)
  dir = mkdtempSync(join(tmpdir(), 'vis-step-'))
  const file = join(dir, 'bundle.mjs')
  writeFileSync(file, result.outputFiles[0].text)
  mod = await import(pathToFileURL(file).href)
})

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const FormulaSim = () => mod.React.createElement('div', { className: 'vis-sim' }, 'sim')

function render(step) {
  // Formula は useLayoutEffect を使う。サーバーでは警告が出るだけなので、この間は黙らせる
  const original = console.error
  console.error = () => {}
  try {
    return mod.renderToStaticMarkup(mod.React.createElement(mod.StepSection, { step, index: 2, sectionId: 'demo' }))
  } finally {
    console.error = original
  }
}

const step = {
  id: 'demo',
  title: 'デモの段階',
  text: '説明の文。',
  formulas: [
    { tex: 'F = -kx', caption: '力', symbols: [{ tex: 'k', meaning: 'バネ定数', unit: '\\mathrm{N/m}' }, { tex: 'x', meaning: '伸び', unit: '\\mathrm{m}' }] },
    { tex: 'E = \\tfrac12 k x^2', caption: 'エネルギー', symbols: [{ tex: 'k', meaning: 'バネ定数', unit: '\\mathrm{N/m}' }, { tex: 'E', meaning: 'エネルギー', unit: '\\mathrm{J}' }] },
  ],
  snippets: ['x'],
  Sim: null,
}

test('段階の並びは 番号と名前 → 説明 → シミュレーション → 式 → 記号の意味 → 実装を見る', () => {
  const html = render({ ...step, Sim: FormulaSim })
  const at = (needle) => {
    const i = html.indexOf(needle)
    assert.ok(i >= 0, `「${needle}」が出ていない`)
    return i
  }
  const order = [at('vis-step__num'), at('説明の文。'), at('class="vis-sim"'), at('vis-formulas'), at('vis-symbols-details'), at('実装を見る')]
  assert.deepEqual([...order].sort((a, b) => a - b), order, `並びが違う: ${order.join(' < ')}`)
})

test('記号の意味は <details> で、初めは閉じていて(open なし)、表は開くまで作らない', () => {
  const html = render({ ...step, Sim: FormulaSim })
  const m = /<details class="vis-code vis-symbols-details"([^>]*)>(.*?)<\/details>/s.exec(html)
  assert.ok(m, '記号の意味の <details> がない')
  assert.ok(!/\bopen\b/.test(m[1]), '初めから開いている')
  assert.match(m[2], /<summary[^>]*>記号の意味<\/summary>/)
  assert.ok(!m[2].includes('<table'), '閉じているのに表がある')
})

test('式の欄に記号の表は入らない(表は記号の意味の欄だけ)', () => {
  const html = render({ ...step, Sim: FormulaSim })
  const formulas = html.slice(html.indexOf('vis-formulas'), html.indexOf('vis-symbols-details'))
  assert.ok(!formulas.includes('<table'))
})

test('記号がない段階では、記号の意味の欄を出さない', () => {
  const html = render({ ...step, Sim: FormulaSim, formulas: [{ tex: 'a = b', caption: '式' }] })
  assert.ok(!html.includes('vis-symbols-details'))
  assert.ok(html.includes('vis-formulas'))
})

test('collectSymbols: 段階の式すべての記号を 1 つにまとめ、同じ記号は最初の 1 つだけ', () => {
  const symbols = mod.collectSymbols(step.formulas)
  assert.deepEqual(symbols.map((s) => s.tex), ['k', 'x', 'E'])
  assert.deepEqual(mod.collectSymbols(undefined), [])
  assert.deepEqual(mod.collectSymbols([{ tex: 'a' }]), [])
})
