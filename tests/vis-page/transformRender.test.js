// 変換のタブの全体と段階 1〜8 のシミュレーションが、描画の段階で例外を出さずに HTML になることを確かめる(サーバー側の描画)。
// 状態を使う React のコンポーネントは JSX なので、esbuild でまとめて読む(react・react-dom も一緒にまとめて、1 つの React にする)。
// canvas の絵・つかむ操作は、描く関数(transform*.js)の単体テストで確かめる。ここでは、枠・凡例・バー・数の表示が出ることだけ見る。
// 実行: node --test "tests/vis-page/*.test.js"
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SIMS = join(ROOT, 'src/components/visualization/sims')
const NAMES = ['transformOverview', 'transformStep1', 'transformStep2', 'transformStep3', 'transformStep4', 'transformStep5', 'transformStep6', 'transformStep7', 'transformStep8']

let tmp
let html // 名前 → HTML

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'vis-render-'))
  const entry = `
    import React from 'react'
    import { renderToString } from 'react-dom/server.browser'
    ${NAMES.map((n) => `import ${n} from '${join(SIMS, n + '.jsx')}'`).join('\n')}
    const all = { ${NAMES.join(', ')} }
    export const render = (name) => renderToString(React.createElement(all[name]))
  `
  const out = join(tmp, 'bundle.mjs')
  await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'jsx' },
    bundle: true,
    write: true,
    outfile: out,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['browser', 'import', 'default'],
    jsx: 'automatic',
    loader: { '.jsx': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })
  // 描画の最初に window・document を読む部品(useSimLoop など)の代役。何も起こさない
  globalThis.window = {
    innerWidth: 1000,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  }
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  const { render } = await import(pathToFileURL(out).href)
  const errors = console.error
  console.error = () => {} // サーバーでは useLayoutEffect が効かない、という注意が出る
  html = {}
  try {
    for (const name of NAMES) html[name] = render(name)
  } finally {
    console.error = errors
  }
})

after(() => {
  delete globalThis.window
  delete globalThis.document
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

test('全体と段階 1〜8 のどれも、枠(vis-sim)・絵(canvas)・バー(スライダーかボタン)が出る', () => {
  for (const name of NAMES) {
    const h = html[name]
    assert.ok(h.includes('class="vis-sim '), `${name}: 枠`)
    assert.ok(/<canvas[^>]*role="application"/.test(h), `${name}: canvas(矢印キーで動かせる)`)
    assert.ok(h.includes('type="range"') || h.includes('vis-btn'), `${name}: バー`)
  }
})

test('全体: 凡例に軸・時刻・時間刻み・キーフレーム・カメラの位置が出て、再生と時刻とカメラのバーがある', () => {
  const h = html.transformOverview
  for (const t of ['軸 x・y・z', '時刻', '時間刻み', 'キーフレーム', 'カメラの位置', '視野角', '手先の画面位置']) assert.ok(h.includes(t), t)
  assert.ok(h.includes('一時停止') || h.includes('再生'), '再生ボタン')
  assert.ok(h.includes('外から見る向き') && h.includes('カメラ（撮った絵をドラッグしても回る）'))
})

test('段階 1〜3: 4×4 の行列の表と、点・向きの計算が出る。段階 2 は R と S、段階 3 は T·R·S と S·R·T', () => {
  assert.ok(html.transformStep1.includes('aria-label="T"') && html.transformStep1.includes('aria-label="p&#x27;"') && html.transformStep1.includes('aria-label="d&#x27;"'))
  assert.ok(html.transformStep2.includes('aria-label="R"') && html.transformStep2.includes('aria-label="S"'))
  assert.ok(html.transformStep3.includes('aria-label="M = T·R·S"') && html.transformStep3.includes('aria-label="M = S·R·T"'))
  // 初期値の平行移動 (1.2, 0.6, 0) が右端の列に出る
  assert.ok(html.transformStep1.includes('1.20') && html.transformStep1.includes('0.60'))
})

test('段階 4〜6: 4 は像の高さの計算、5 は点ごとのクリップ座標と内外、6 は画素の座標が出る', () => {
  assert.ok(html.transformStep4.includes('y′ = f·y / z'), '段階 4 の式')
  assert.ok(html.transformStep4.includes('<strong>0.28</strong>'), '段階 4: P の像の高さ 1.5 × 1.1 / 6 = 0.275 → 0.28')
  assert.ok(html.transformStep5.includes('aria-label="P の (x_c, y_c, z_c, w_c)"'), '段階 5 のクリップ座標の表')
  assert.ok(html.transformStep5.includes('内側') && html.transformStep5.includes('外側') && html.transformStep5.includes('カメラの後ろ'), '段階 5 の内外')
  assert.ok(html.transformStep6.includes('<strong>260</strong>'), '段階 6: x_s = 400/2 × (0.3 + 1) = 260')
})

test('段階 7・8: 7 は時刻と 2 つの補間の値のバー、8 は解き方の切り替えとヤコビアンの行列が出る', () => {
  assert.ok(html.transformStep7.includes('時刻') && html.transformStep7.includes('キーフレーム 2 の値'))
  assert.ok(html.transformStep8.includes('解析解') && html.transformStep8.includes('ヤコビアン') && html.transformStep8.includes('aria-label="J [m/rad]"'))
})
