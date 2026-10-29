// 節のデータの文章と式を読みやすく並べる(読み直し用)。node dump-sections.mjs <worktree> <tabId>
import { createRequire } from 'node:module'
import { join } from 'node:path'

const [root, tab] = process.argv.slice(2)
const require = createRequire(join(root, 'package.json'))
const { build } = require('esbuild')
const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /\.jsx$|^react$/ }, (args) => ({ path: args.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
      loader: 'js',
      contents: args.path === 'react' ? 'export const lazy = (l) => l' : 'export default function S() { return null }',
    }))
  },
}
const result = await build({
  entryPoints: [join(root, 'src/components/visualization-methods/sections', `${tab}.js`)],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stub],
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const s = mod.default
const out = [`# ${s.title}（${s.tabLabel}）`, s.intro, `全体の一言: ${s.overview.caption}`, '']
s.steps.forEach((st, i) => {
  out.push(`## ${i + 1} ${st.title}`, st.text)
  for (const f of st.formulas ?? []) {
    out.push(`  式「${f.caption ?? ''}」 ${f.tex}`)
    for (const sym of f.symbols ?? []) out.push(`    ${sym.tex} … ${sym.meaning}${sym.unit ? ` [${sym.unit}]` : ''}`)
  }
  out.push(`  抜粋: ${(st.snippets ?? []).join(', ')}`, '')
})
if (s.combination) {
  out.push('## 組み合わせ', s.combination.text ?? '')
  for (const f of s.combination.flow) out.push(`  [${f.steps.join(', ')}] ${f.text}`)
}
console.log(out.join('\n'))
