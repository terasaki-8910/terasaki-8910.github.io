// 「実装を見る」(src/components/visualization/CodeExcerpt.jsx)が読む // @snippet 〜 // @end の印が、
// src/utils/vis/*.js で壊れていないことを確かめる。実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { listSnippets, extractSnippet, snippetFile } from '../../src/components/visualization/snippets.js'

const VIS_DIR = fileURLToPath(new URL('../../src/utils/vis/', import.meta.url))
const files = readdirSync(VIS_DIR).filter((f) => f.endsWith('.js'))

test('抜粋を取り出せる', () => {
  const text = ['a', '// @snippet foo-bar', 'const x = 1', '', '// @end', 'b', '// @snippet foo-baz', 'x', '// @end'].join('\n')
  assert.deepEqual(listSnippets(text), [
    { name: 'foo-bar', code: 'const x = 1' },
    { name: 'foo-baz', code: 'x' },
  ])
  assert.equal(extractSnippet(text, 'foo-baz'), 'x')
  assert.equal(extractSnippet(text, 'nothing'), null)
  assert.equal(snippetFile('collide-reflectVelocity'), 'collide')
})

test('@end のない @snippet は throw する', () => {
  assert.throws(() => listSnippets('// @snippet a-b\nx\n'), /@end/)
  assert.throws(() => listSnippets('// @snippet a-b\n// @snippet a-c\n// @end\n'), /@end/)
  assert.throws(() => listSnippets('// @end\n'), /@snippet/)
})

for (const file of files) {
  test(`${file}: 印が対になっていて、名前は「ファイル名-」で始まり、重複しない`, () => {
    const base = file.replace(/\.js$/, '')
    const snippets = listSnippets(readFileSync(join(VIS_DIR, file), 'utf8'))
    const names = snippets.map((s) => s.name)
    assert.equal(new Set(names).size, names.length, `${file} に重複した抜粋名があります`)
    for (const s of snippets) {
      assert.equal(snippetFile(s.name), base, `${s.name} は ${base}- で始めてください`)
      assert.ok(s.code.length > 0, `${s.name} が空です`)
    }
  })
}
