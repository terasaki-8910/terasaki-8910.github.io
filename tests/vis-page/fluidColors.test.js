// 流体の粒子の色が、どちらのテーマでも描画の地(--color-surface)に対して 3:1 以上(図形のコントラスト)かを、
// src/index.css のトークンから計算して確かめる。実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ensureCache, FAST_COLOR, LEVELS } from '../../src/components/visualization/sims/fluidCore.js'

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

// セレクタのブロックから --名前: 値; を取り出す
function tokens(selector) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, selector)
  const body = css.slice(start, css.indexOf('}', start))
  const out = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function rgbOf(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
  return value.split(/\s+/).map(Number) // 「250 160 160」の形
}

const linear = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

for (const [name, selector] of [
  ['ライト', ':root'],
  ['ダーク', ':root[data-theme="dark"]'],
  ['ライト(明示)', ':root[data-theme="light"]'],
]) {
  test(`流体の粒子の色(${name}): ink から ${FAST_COLOR} までの全部の段が、地に対して 3:1 以上`, () => {
    const t = tokens(selector)
    const colors = { rgb: { ink: rgbOf(t['color-ink']), [FAST_COLOR]: rgbOf(t[FAST_COLOR]) }, alpha: () => '' }
    const ground = rgbOf(t['color-surface'])
    const { palette } = ensureCache({ colors: null }, colors)
    assert.equal(palette.length, LEVELS)
    for (const style of palette) {
      const c = style.match(/\d+/g).map(Number)
      assert.ok(ratio(c, ground) >= 3, `${style} は地 ${ground} に ${ratio(c, ground).toFixed(2)}:1`)
    }
  })
}
