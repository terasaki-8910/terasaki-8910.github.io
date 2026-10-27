// ボリュームのタブの、キーで選ぶ操作(src/components/visualization-methods/sims/volumeKeys.js の純粋な関数)を確かめる。
// 段階 1・2・5 は、つかめる丸(ブロック・σ の棒・光線の端点)の一部がマウスでしか選べなかった。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barKey, clampIndex, cycleIndex, handleAt, handleNumber, selectKey } from '../../src/components/visualization-methods/sims/volumeKeys.js'

const key = (name, mods = {}) => ({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods })

test('clampIndex: 番号を 0〜count − 1 に収める(数が減ったあとの古い番号、負、NaN、小数、数が 0 個でも落ちない)', () => {
  assert.equal(clampIndex(2, 5), 2)
  assert.equal(clampIndex(7, 4), 3)
  assert.equal(clampIndex(-1, 4), 0)
  assert.equal(clampIndex(Number.NaN, 4), 0)
  assert.equal(clampIndex(undefined, 4), 0)
  assert.equal(clampIndex(2.9, 4), 2)
  assert.equal(clampIndex(3, 0), 0)
  assert.equal(clampIndex(3, Number.NaN), 0)
})

test('cycleIndex: 前・次の番号は端で反対の端に回り、古い番号からでも範囲に入る', () => {
  assert.equal(cycleIndex(0, 3, -1), 2)
  assert.equal(cycleIndex(2, 3, 1), 0)
  assert.equal(cycleIndex(1, 3, 1), 2)
  assert.equal(cycleIndex(1, 3, -1), 0)
  assert.equal(cycleIndex(9, 3, 1), 0) // 9 → 2 に丸めてから次へ
  assert.equal(cycleIndex(5, 0, 1), 0)
})

test('selectKey: PageUp = 前、PageDown = 次、Home = 最初、End = 最後。Tab・矢印・Alt/Ctrl/Cmd つきは扱わない', () => {
  assert.equal(selectKey(key('PageDown'), 0, 3), 1)
  assert.equal(selectKey(key('PageUp'), 0, 3), 2)
  assert.equal(selectKey(key('Home'), 2, 3), 0)
  assert.equal(selectKey(key('End'), 0, 3), 2)
  assert.equal(selectKey(key('PageDown', { shiftKey: true }), 0, 3), 1)
  for (const name of ['Tab', 'ArrowLeft', 'ArrowUp', '1', 'Enter', ' ']) assert.equal(selectKey(key(name), 0, 3), null, name)
  for (const mod of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const name of ['PageUp', 'PageDown', 'Home', 'End']) assert.equal(selectKey(key(name, { [mod]: true }), 0, 3), null, `${mod} + ${name}`)
  }
  assert.equal(selectKey(key('PageDown'), 0, 0), null) // 選ぶ物がない
})

test('段階 1・5: 3 つのブロック・2 つの端点は、PageUp・PageDown だけで全部に届く', () => {
  for (const count of [2, 3]) {
    const seen = new Set([0])
    let selected = 0
    for (let n = 1; n < count; n++) {
      selected = selectKey(key('PageDown'), selected, count)
      seen.add(selected)
    }
    assert.equal(seen.size, count, `${count} つに届かない`)
    assert.equal(selectKey(key('PageDown'), selected, count), 0) // 一周して戻る
  }
})

test('段階 2: 丸の番号は、点ごとに σ、Lₑ の順(左から右)で 0〜15。番号と { kind, index } は行き来できる', () => {
  assert.equal(handleNumber({ kind: 'sigma', index: 0 }), 0)
  assert.equal(handleNumber({ kind: 'emission', index: 0 }), 1)
  assert.equal(handleNumber({ kind: 'sigma', index: 7 }), 14)
  assert.equal(handleNumber({ kind: 'emission', index: 7 }), 15)
  for (let n = 0; n < 16; n++) assert.equal(handleNumber(handleAt(n)), n)
  assert.deepEqual(handleAt(5), { kind: 'emission', index: 2 })
  assert.deepEqual(handleAt(6), { kind: 'sigma', index: 3 })
})

test('段階 2: PageDown を 15 回押すと 16 個の丸(σ の棒も)を 1 回ずつ通り、PageUp で戻れる', () => {
  let selected = { kind: 'sigma', index: 0 }
  const seen = [handleNumber(selected)]
  for (let n = 0; n < 15; n++) {
    selected = barKey(key('PageDown'), selected, 8).selected
    seen.push(handleNumber(selected))
  }
  assert.deepEqual(seen, Array.from({ length: 16 }, (_, n) => n))
  assert.equal(seen.filter((n) => n % 2 === 0).length, 8, 'σ の丸 8 個に届く')
  assert.deepEqual(barKey(key('PageDown'), selected, 8).selected, { kind: 'sigma', index: 0 }) // 一周
  assert.deepEqual(barKey(key('PageUp'), { kind: 'sigma', index: 0 }, 8).selected, { kind: 'emission', index: 7 })
  assert.deepEqual(barKey(key('PageUp'), { kind: 'emission', index: 3 }, 8).selected, { kind: 'sigma', index: 3 })
  assert.deepEqual(barKey(key('Home'), { kind: 'emission', index: 5 }, 8).selected, { kind: 'sigma', index: 0 })
  assert.deepEqual(barKey(key('End'), { kind: 'sigma', index: 5 }, 8).selected, { kind: 'emission', index: 7 })
})

test('段階 2: ← → は同じ種類の隣の点(端で止まる)、↑ ↓ は選んでいる丸の高さ(↑ が正、Shift で 5 倍)', () => {
  assert.deepEqual(barKey(key('ArrowRight'), { kind: 'sigma', index: 3 }, 8).selected, { kind: 'sigma', index: 4 })
  assert.deepEqual(barKey(key('ArrowLeft'), { kind: 'emission', index: 3 }, 8).selected, { kind: 'emission', index: 2 })
  assert.deepEqual(barKey(key('ArrowLeft'), { kind: 'sigma', index: 0 }, 8).selected, { kind: 'sigma', index: 0 })
  assert.deepEqual(barKey(key('ArrowRight'), { kind: 'emission', index: 7 }, 8).selected, { kind: 'emission', index: 7 })
  assert.deepEqual(barKey(key('ArrowRight', { shiftKey: true }), { kind: 'sigma', index: 1 }, 8).selected, { kind: 'sigma', index: 2 }) // Shift でも隣
  assert.deepEqual(barKey(key('ArrowUp'), { kind: 'sigma', index: 3 }, 8), { delta: 1 })
  assert.deepEqual(barKey(key('ArrowDown'), { kind: 'sigma', index: 3 }, 8), { delta: -1 })
  assert.deepEqual(barKey(key('ArrowUp', { shiftKey: true }), { kind: 'emission', index: 3 }, 8), { delta: 5 })
})

test('段階 2: Tab・Alt/Ctrl/Cmd つき・関係ないキーは扱わない。範囲の外の選びでも落ちない', () => {
  const selected = { kind: 'sigma', index: 3 }
  for (const name of ['Tab', 'Enter', 'a', '1']) assert.equal(barKey(key(name), selected, 8), null, name)
  for (const mod of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const name of ['ArrowLeft', 'ArrowUp', 'PageUp', 'PageDown', 'Home', 'End']) assert.equal(barKey(key(name, { [mod]: true }), selected, 8), null, `${mod} + ${name}`)
  }
  assert.doesNotThrow(() => barKey(key('PageDown'), { kind: 'emission', index: 20 }, 8))
  assert.deepEqual(barKey(key('ArrowRight'), { kind: 'sigma', index: 20 }, 8).selected, { kind: 'sigma', index: 7 })
})
