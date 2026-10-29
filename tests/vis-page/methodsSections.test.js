// 可視化手法ページの節データが、既存ページと同じ形になっていることを検査する
// (tests/vis-page/sections.test.js と同じ検査。式は KaTeX で組めること、抜粋は src/utils/vis/ にあること)。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import katex from 'katex'
import { listSnippets } from '../../src/components/visualization/snippets.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SECTIONS_ENTRY = join(ROOT, 'src/components/visualization-methods/sections/index.js')
const SECTIONS_URL = pathToFileURL(SECTIONS_ENTRY)
const VIS_DIR = join(ROOT, 'src/utils/vis')

let SECTIONS
let KNOWN_SNIPPETS

before(async () => {
  const module = await import(SECTIONS_URL.href)
  SECTIONS = module.SECTIONS
  KNOWN_SNIPPETS = new Set()
  for (const file of readdirSync(VIS_DIR).filter((f) => f.endsWith('.js'))) {
    for (const s of listSnippets(readFileSync(join(VIS_DIR, file), 'utf8'))) KNOWN_SNIPPETS.add(s.name)
  }
})

const renderTex = (tex) => katex.renderToString(tex, { output: 'mathml', throwOnError: true, strict: false })

function checkFormulas(where, formulas) {
  for (const [i, f] of formulas.entries()) {
    assert.ok(typeof f.tex === 'string' && f.tex.trim(), `${where}: formulas[${i}].tex が空`)
    assert.doesNotThrow(() => renderTex(f.tex), `${where}: formulas[${i}].tex を KaTeX で組めない`)
    for (const [j, s] of (f.symbols ?? []).entries()) {
      assert.ok(typeof s.tex === 'string' && s.tex.trim(), `${where}: formulas[${i}].symbols[${j}].tex が空`)
      assert.ok(typeof s.meaning === 'string' && s.meaning.trim(), `${where}: formulas[${i}].symbols[${j}].meaning が空`)
      assert.doesNotThrow(() => renderTex(s.tex), `${where}: formulas[${i}].symbols[${j}].tex を KaTeX で組めない`)
      if (s.unit) assert.doesNotThrow(() => renderTex(s.unit), `${where}: formulas[${i}].symbols[${j}].unit を KaTeX で組めない`)
    }
  }
}

const isString = (value) => typeof value === 'string' && value.trim().length > 0
const isComponent = (value) =>
  typeof value === 'function' || (value && typeof value === 'object' && Boolean(value.$$typeof))
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const OLD_KEYS = ['description', 'formulas', 'snippets', 'Sim']
const IDS = ['shape', 'shading', 'isosurface', 'volume', 'flow', 'ct']

test('節は 6 つで、タブの並びと id が決まっている', () => {
  assert.deepEqual(SECTIONS.map((section) => section.id), IDS)
})

for (const id of IDS) {
  test(`${id}: 第 2 版の形(id・tabLabel・title・intro・overview・steps・combination・sources)`, () => {
    const section = SECTIONS.find((item) => item.id === id)
    for (const key of OLD_KEYS) assert.ok(!(key in section), `${id}: 第 1 版の「${key}」が残っている`)
    for (const key of ['tabLabel', 'title', 'intro']) assert.ok(isString(section[key]), `${id}: ${key} が空`)
    assert.ok(section.overview && isComponent(section.overview.Sim), `${id}: overview.Sim がコンポーネントでない`)
    assert.ok(isString(section.overview.caption), `${id}: overview.caption が空`)
    assert.ok(Array.isArray(section.steps), `${id}: steps は配列`)
    assert.ok(Array.isArray(section.sources) && section.sources.length > 0, `${id}: sources が空`)
    for (const source of section.sources) {
      assert.ok(isString(source.text), `${id}: sources の text が空`)
      assert.ok(source.href === undefined || /^https:\/\//.test(source.href), `${id}: sources の href は https`)
    }
  })

  test(`${id}: 段階の id が重ならず、必須データが正しい`, () => {
    const section = SECTIONS.find((item) => item.id === id)
    const seen = new Set()
    for (const [i, step] of section.steps.entries()) {
      const where = `${id} の段階 ${i + 1}`
      assert.ok(ID.test(step.id), `${where}: id は a-z0-9 とハイフン`)
      assert.ok(!seen.has(step.id), `${where}: id「${step.id}」が重なっている`)
      seen.add(step.id)
      assert.ok(isString(step.title), `${where}: title が空`)
      assert.ok(isString(step.text), `${where}: text が空`)
      assert.ok(isComponent(step.Sim), `${where}: Sim がコンポーネントでない`)
      assert.ok(Array.isArray(step.formulas ?? []), `${where}: formulas は配列`)
      assert.ok(Array.isArray(step.snippets ?? []), `${where}: snippets は配列`)
      checkFormulas(where, step.formulas ?? [])
      for (const name of step.snippets ?? []) assert.ok(KNOWN_SNIPPETS.has(name), `${where}: 抜粋「${name}」が src/utils/vis/ にない`)
    }
  })

  test(`${id}: 組み合わせは段階があるときだけあり、番号が段階の範囲に収まる`, () => {
    const section = SECTIONS.find((item) => item.id === id)
    if (section.steps.length === 0) {
      assert.ok(!section.combination, `${id}: 段階が空なのに combination がある`)
      return
    }
    assert.ok(section.combination && Array.isArray(section.combination.flow) && section.combination.flow.length > 0)
    for (const item of section.combination.flow) {
      assert.ok(isString(item.text))
      assert.ok(Array.isArray(item.steps) && item.steps.length > 0)
      for (const number of item.steps) {
        assert.ok(Number.isInteger(number) && number >= 1 && number <= section.steps.length)
      }
    }
  })

  test(`${id}: 第 1 版の名残(legacy*)は残っていない`, () => {
    const section = SECTIONS.find((item) => item.id === id)
    assert.deepEqual(Object.keys(section).filter((key) => /^legacy/i.test(key)), [])
  })
}
