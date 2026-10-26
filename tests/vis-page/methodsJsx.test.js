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

test('CSS の変数は、src/index.css にあるトークンだけを使う(accent はチャンネル値なので rgb() で包む)', () => {
  const css = readFileSync(fileURLToPath(new URL('../../src/index.css', import.meta.url)), 'utf8')
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const dir = fileURLToPath(new URL('../../src/components/visualization-methods/', import.meta.url))
  const files = []
  for (const sub of ['sims', 'sections']) for (const f of readdirSync(join(dir, sub))) files.push(join(dir, sub, f))
  const bad = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(rgb\()?var\((--[a-z0-9-]+)\)/g)) {
      if (!defined.has(m[2])) bad.push(`${file}: ${m[2]} は定義されていない`)
      else if (/^--color-(on-)?accent$/.test(m[2]) && !m[1]) bad.push(`${file}: ${m[2]} は rgb(var(...)) で使う`)
    }
  }
  assert.deepEqual(bad, [])
})

test('見える canvas に putImageData を直接使わない(dpr 2 で絵が 1/4 になる。pixelKit.js の blitPixels を使う)', () => {
  const bad = []
  for (const file of readdirSync(SIMS)) {
    if (file === 'pixelKit.js') continue
    const src = readFileSync(join(SIMS, file), 'utf8')
    for (const line of src.split('\n')) {
      if (/\bctx\.putImageData\(/.test(line)) bad.push(`${file}: ${line.trim()}`)
    }
  }
  assert.deepEqual(bad, [])
})
