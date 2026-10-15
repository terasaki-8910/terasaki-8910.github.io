// 節のデータ(src/components/visualization/sections/*.js)の「第 2 版の形」を検査する。形は sections/index.js の冒頭に書いてある。
// 実行: node --test "tests/vis-page/*.test.js"
// 節のデータは JSX の部品(シミュレーション)を import するので、そのまま Node では読めない。esbuild でまとめて読む
// (.jsx と react は中身のない代役に差し替える。データの形を見るだけで、部品は動かさない)。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import katex from 'katex'
import { listSnippets } from '../../src/components/visualization/snippets.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SECTIONS_ENTRY = join(ROOT, 'src/components/visualization/sections/index.js')
const VIS_DIR = join(ROOT, 'src/utils/vis')

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

let SECTIONS
let KNOWN_SNIPPETS

before(async () => {
  const result = await build({
    entryPoints: [SECTIONS_ENTRY],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [stubJsx],
  })
  const code = result.outputFiles[0].text
  ;({ SECTIONS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
  KNOWN_SNIPPETS = new Set()
  for (const file of readdirSync(VIS_DIR).filter((f) => f.endsWith('.js'))) {
    for (const s of listSnippets(readFileSync(join(VIS_DIR, file), 'utf8'))) KNOWN_SNIPPETS.add(s.name)
  }
})

const isString = (v) => typeof v === 'string' && v.trim().length > 0
// React のコンポーネント(関数)か、lazy で包んだもの
const isComponent = (v) => typeof v === 'function' || (v && typeof v === 'object' && v.$$typeof === 'lazy-stub')
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const OLD_KEYS = ['description', 'formulas', 'snippets', 'Sim']

function checkFormulas(where, formulas) {
  assert.ok(Array.isArray(formulas), `${where}: formulas は配列`)
  for (const [i, f] of formulas.entries()) {
    assert.ok(isString(f.tex), `${where}: formulas[${i}].tex が空`)
    katex.renderToString(f.tex, { output: 'mathml', throwOnError: true, strict: false })
    for (const [j, s] of (f.symbols ?? []).entries()) {
      assert.ok(isString(s.tex), `${where}: formulas[${i}].symbols[${j}].tex が空`)
      assert.ok(isString(s.meaning), `${where}: formulas[${i}].symbols[${j}].meaning が空`)
      assert.ok(s.unit === undefined || typeof s.unit === 'string', `${where}: formulas[${i}].symbols[${j}].unit は文字列`)
      katex.renderToString(s.tex, { output: 'mathml', throwOnError: true, strict: false })
      if (s.unit) katex.renderToString(s.unit, { output: 'mathml', throwOnError: true, strict: false })
    }
  }
}

function checkSnippets(where, names) {
  assert.ok(Array.isArray(names), `${where}: snippets は配列`)
  for (const name of names) {
    assert.ok(KNOWN_SNIPPETS.has(name), `${where}: 抜粋「${name}」が src/utils/vis/ にありません`)
  }
}

test('節は 4 つで、タブの並びと id が決まっている', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ['transform', 'rigid', 'cloth', 'fluid'])
})

for (const id of ['transform', 'rigid', 'cloth', 'fluid']) {
  test(`${id}: 第 2 版の形(id・tabLabel・title・intro・overview・steps・combination・sources)`, () => {
    const s = SECTIONS.find((x) => x.id === id)
    for (const key of OLD_KEYS) assert.ok(!(key in s), `${id}: 第 1 版の「${key}」が残っている(legacy* に名前を変える)`)
    for (const key of ['tabLabel', 'title', 'intro']) assert.ok(isString(s[key]), `${id}: ${key} が空`)
    assert.ok(s.overview && isComponent(s.overview.Sim), `${id}: overview.Sim がコンポーネントでない`)
    assert.ok(isString(s.overview.caption), `${id}: overview.caption が空`)
    assert.ok(Array.isArray(s.steps), `${id}: steps は配列`)
    assert.ok(Array.isArray(s.sources) && s.sources.length > 0, `${id}: sources が空`)
    for (const src of s.sources) {
      assert.ok(isString(src.text), `${id}: sources の text が空`)
      assert.ok(src.href === undefined || /^https:\/\//.test(src.href), `${id}: sources の href は https`)
    }
  })

  test(`${id}: 段階(steps)の id が重ならず、式・抜粋・シミュレーションが正しい`, () => {
    const s = SECTIONS.find((x) => x.id === id)
    const seen = new Set()
    for (const [i, step] of s.steps.entries()) {
      const where = `${id} の段階 ${i + 1}`
      assert.ok(ID.test(step.id), `${where}: id は a-z0-9 とハイフン`)
      assert.ok(!seen.has(step.id), `${where}: id「${step.id}」が重なっている`)
      seen.add(step.id)
      assert.ok(isString(step.title), `${where}: title が空`)
      assert.ok(isString(step.text), `${where}: text が空`)
      assert.ok(isComponent(step.Sim), `${where}: Sim がコンポーネントでない`)
      checkFormulas(where, step.formulas ?? [])
      checkSnippets(where, step.snippets ?? [])
    }
  })

  test(`${id}: 組み合わせ(combination)は、段階があるときだけあり、番号が段階の範囲に収まる`, () => {
    const s = SECTIONS.find((x) => x.id === id)
    if (s.steps.length === 0) {
      assert.ok(!s.combination, `${id}: 段階が空なのに combination がある`)
      return
    }
    assert.ok(s.combination && Array.isArray(s.combination.flow) && s.combination.flow.length > 0, `${id}: 段階があるのに combination.flow がない`)
    assert.ok(s.combination.text === undefined || isString(s.combination.text), `${id}: combination.text は文字列`)
    for (const [i, item] of s.combination.flow.entries()) {
      assert.ok(isString(item.text), `${id}: combination.flow[${i}].text が空`)
      assert.ok(Array.isArray(item.steps) && item.steps.length > 0, `${id}: combination.flow[${i}].steps が空`)
      for (const n of item.steps) {
        assert.ok(Number.isInteger(n) && n >= 1 && n <= s.steps.length, `${id}: combination.flow[${i}] の段階の番号 ${n} が範囲(1〜${s.steps.length})の外`)
      }
    }
  })

  test(`${id}: 第 1 版から残した legacy* の式は KaTeX で読め、抜粋は実在する`, () => {
    const s = SECTIONS.find((x) => x.id === id)
    if (s.legacyFormulas) checkFormulas(`${id} の legacyFormulas`, s.legacyFormulas)
    if (s.legacySnippets) checkSnippets(`${id} の legacySnippets`, s.legacySnippets)
    if (s.legacyDescription !== undefined) assert.ok(isString(s.legacyDescription))
  })
}

// 段階に移した式・抜粋は、legacy には残さない(同じものが二重に出ないように)
test('段階に移した抜粋と式は、legacySnippets・legacyFormulas から消してある', () => {
  for (const s of SECTIONS) {
    const snippetsInSteps = new Set(s.steps.flatMap((step) => step.snippets ?? []))
    for (const name of s.legacySnippets ?? []) {
      assert.ok(!snippetsInSteps.has(name), `${s.id}: 抜粋「${name}」が段階と legacySnippets の両方にある(legacy から消す)`)
    }
    const texInSteps = new Set(s.steps.flatMap((step) => (step.formulas ?? []).map((f) => f.tex)))
    for (const f of s.legacyFormulas ?? []) {
      assert.ok(!texInSteps.has(f.tex), `${s.id}: 式「${f.caption ?? f.id}」が段階と legacyFormulas の両方にある(legacy から消す)`)
    }
  }
})
