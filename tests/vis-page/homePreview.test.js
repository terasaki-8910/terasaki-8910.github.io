import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { VISUALIZATION_TABS, VISUALIZATION_PREVIEW_TAB } from '../../src/data/visualizationTabs.js'

// sections.test.js と同じ代役で JSX を読み飛ばし、節のデータだけを調べる。
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
before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../../src/components/visualization/sections/index.js', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [stubJsx],
  })
  const code = result.outputFiles[0].text
  ;({ SECTIONS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
})

test('ホームのタブは節の id・ラベル・並びと一致する', () => {
  assert.deepEqual(VISUALIZATION_TABS, SECTIONS.map(({ id, tabLabel }) => ({ id, label: tabLabel })))
})

test('ホームで見せるシミュレーションのタブが存在する', () => {
  assert.ok(VISUALIZATION_TABS.some(({ id }) => id === VISUALIZATION_PREVIEW_TAB))
})
