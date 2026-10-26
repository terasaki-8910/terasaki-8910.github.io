// /visualization-methods/ のシミュレーションの JSX の書き方の検査。
// JSX の属性の文字列(symbol="…")はエスケープを解かないので、"\\varepsilon" と書くとバックスラッシュが 2 つのまま
// KaTeX に渡り、記号の代わりに文字が出る(2026-10-26 に画面で見つけた)。属性の文字列には 1 つで書く。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const SIMS = fileURLToPath(new URL('../../src/components/visualization-methods/sims/', import.meta.url))
const BS = String.fromCharCode(92)

test('JSX の属性の文字列に、バックスラッシュを 2 つ続けて書いていない', () => {
  const bad = []
  for (const file of readdirSync(SIMS).filter((f) => f.endsWith('.jsx'))) {
    const src = readFileSync(join(SIMS, file), 'utf8')
    for (const m of src.matchAll(/\b([a-zA-Z]+)="([^"]*)"/g)) {
      if (m[2].includes(BS + BS)) bad.push(`${file}: ${m[1]}="${m[2]}"`)
    }
  }
  assert.deepEqual(bad, [])
})
