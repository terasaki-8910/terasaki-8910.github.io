// 節「剛体と衝突」のデータ(src/components/visualization/sections/rigid.js)の中身を確かめる。
// 形そのものは sections.test.js が全節に対して検査する。ここは、この節の決めごと(段階 6 つ、組み合わせが全段階を使う、
// 第 1 版の式・抜粋を段階へ移し終えた)だけ。節のデータは JSX の部品を import するので、sections.test.js と同じく esbuild でまとめて読む。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ENTRY = join(ROOT, 'src/components/visualization/sections/rigid.js')

const stubJsx = {
  name: 'stub-jsx',
  setup(b) {
    b.onResolve({ filter: /\.jsx$|^react$/ }, (args) => ({ path: args.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
      loader: 'js',
      contents:
        args.path === 'react'
          ? 'export const lazy = (load) => ({ $$typeof: "lazy-stub", load })'
          : 'export default function Stub() { return null }',
    }))
  },
}

let rigid

before(async () => {
  const result = await build({ entryPoints: [ENTRY], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stubJsx] })
  const code = result.outputFiles[0].text
  ;({ default: rigid } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
})

test('rigid: 段階は 6 つで、順に 運動方程式 → 反発係数 → 円の重なり → 広域の判定 → 撃力 → 押し戻し', () => {
  assert.deepEqual(
    rigid.steps.map((s) => s.id),
    ['euler', 'restitution', 'circle-overlap', 'broad-phase', 'impulse', 'separation'],
  )
})

test('rigid: 各段階に式と実装の抜粋があり、記号の表がある', () => {
  for (const step of rigid.steps) {
    assert.ok(step.formulas.length >= 1, `${step.id}: 式がない`)
    assert.ok(step.snippets.length >= 1, `${step.id}: 抜粋がない`)
    for (const f of step.formulas) assert.ok(f.symbols?.length >= 1, `${step.id}: 「${f.caption}」に記号の表がない`)
  }
})

test('rigid: 組み合わせは、全段階をちょうど 1 回ずつ使い、1・4・3・5・6・2 の順に全体を作る', () => {
  const used = rigid.combination.flow.flatMap((item) => item.steps)
  assert.deepEqual(used, [1, 4, 3, 5, 6, 2])
  assert.deepEqual([...used].sort(), [1, 2, 3, 4, 5, 6])
})

test('rigid: 第 1 版の legacyFormulas・legacySnippets・legacyDescription は残っていない', () => {
  assert.equal(rigid.legacyFormulas, undefined)
  assert.equal(rigid.legacySnippets, undefined)
  assert.equal(rigid.legacyDescription, undefined)
})

test('rigid: 段階のシミュレーションは rigidStep1〜6.jsx で、ファイルがある', () => {
  const source = readFileSync(ENTRY, 'utf8')
  for (let n = 1; n <= 6; n++) {
    assert.match(source, new RegExp(`import\\('\\.\\./sims/rigidStep${n}\\.jsx'\\)`), `rigidStep${n}.jsx を読んでいない`)
    readFileSync(join(ROOT, `src/components/visualization/sims/rigidStep${n}.jsx`), 'utf8')
  }
})
