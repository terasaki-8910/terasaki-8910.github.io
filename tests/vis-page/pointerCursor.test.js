// usePointerDrag の cursor の決め方(つかんでいないとき・つかんでいるとき)。実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoverCursor, dragCursor } from '../../src/components/visualization/usePointerDrag.js'

const p = { x: 10, y: 20 }

test('hoverCursor: canGrab が true なら grab、false か無ければ既定(空)', () => {
  assert.equal(hoverCursor({ canGrab: () => true }, p), 'grab')
  assert.equal(hoverCursor({ canGrab: () => false }, p), '')
  assert.equal(hoverCursor({}, p), '')
})

test('hoverCursor: cursorAt の文字列は canGrab が false でも効く(何もない所で ew-resize)', () => {
  const handlers = { canGrab: () => false, cursorAt: () => 'ew-resize' }
  assert.equal(hoverCursor(handlers, p), 'ew-resize')
  assert.equal(hoverCursor({ cursorAt: () => 'ew-resize' }, p), 'ew-resize') // canGrab が無くても
})

test('hoverCursor: cursorAt が何も返さなければ canGrab にまかせる。文字列を返せば canGrab が true でもそちらが優先', () => {
  for (const none of [undefined, null, '']) {
    assert.equal(hoverCursor({ canGrab: () => true, cursorAt: () => none }, p), 'grab')
    assert.equal(hoverCursor({ canGrab: () => false, cursorAt: () => none }, p), '')
  }
  assert.equal(hoverCursor({ canGrab: () => true, cursorAt: () => 'ns-resize' }, p), 'ns-resize')
})

test('hoverCursor: 座標をそのまま渡す', () => {
  const seen = []
  hoverCursor({ canGrab: (q) => (seen.push(['canGrab', q]), false), cursorAt: (q) => (seen.push(['cursorAt', q]), null) }, p)
  assert.deepEqual(seen, [['cursorAt', p], ['canGrab', p]])
})

test('dragCursor: 押し始めが grab か指定なしなら grabbing、grab 以外の指定ならそのまま', () => {
  assert.equal(dragCursor('grab'), 'grabbing')
  assert.equal(dragCursor(''), 'grabbing')
  assert.equal(dragCursor(undefined), 'grabbing')
  assert.equal(dragCursor('ew-resize'), 'ew-resize')
})
