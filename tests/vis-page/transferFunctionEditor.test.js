// 伝達関数エディタ(src/components/visualization-methods/sims/TransferFunctionEditor.jsx)の、点の選び方・動かし方
// (tfEditorKit.js の純粋な関数)を確かめる。
// 見つかった不具合: プリセットを切り替えて点の数が減ると(中身 8 点 → 骨 4 点)、選んでいる番号が範囲の外を指し、
// 矢印キーで next[i] が undefined になって TypeError で落ちた。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TF_KEY_STEP,
  TF_MIN_GAP,
  TF_PRESETS,
  cloneTfPoints,
  describePoint,
  movePoint,
  tfKeyAction,
} from '../../src/components/visualization-methods/sims/tfEditorKit.js'

const key = (name, mods = {}) => ({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods })
const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)
const PRESETS = Object.entries(TF_PRESETS)

test('プリセットの点は値の小さい順で、値・不透明度・色の位置が 0〜1(点の数は 骨 4・中身 8・全部 6)', () => {
  assert.deepEqual(Object.keys(TF_PRESETS).sort(), ['全部', '中身', '骨'].sort())
  assert.equal(TF_PRESETS['骨'].length, 4)
  assert.equal(TF_PRESETS['中身'].length, 8)
  assert.equal(TF_PRESETS['全部'].length, 6)
  for (const [name, points] of PRESETS) {
    points.forEach((point, i) => {
      for (const field of ['value', 'alpha', 't']) assert.ok(point[field] >= 0 && point[field] <= 1, `${name}[${i}].${field}`)
      if (i > 0) assert.ok(point.value > points[i - 1].value, `${name}: 値が増えていない`)
    })
  }
})

test('回帰: 中身(8 点)の最後の点を選んだまま骨(4 点)に切り替えても、矢印キーで落ちず、最後の点が動く', () => {
  const bone = cloneTfPoints(TF_PRESETS['骨'])
  // 以前は selected = 7 のまま next[7] を読んで TypeError
  for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.doesNotThrow(() => tfKeyAction(bone, 7, key(name)), name)
  }
  const up = tfKeyAction(bone, 7, key('ArrowUp'))
  assert.equal(up.selected, 3)
  near(up.points[3].alpha, bone[3].alpha + TF_KEY_STEP)
  const left = tfKeyAction(bone, 7, key('ArrowLeft'))
  assert.equal(left.selected, 3)
  near(left.points[3].value, bone[3].value - TF_KEY_STEP)
})

test('どのプリセットからどのプリセットへ切り替えても、古い番号のままのどのキーでも落ちず、選びは範囲に収まる', () => {
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']
  for (const [from, fromPoints] of PRESETS) {
    for (const [to, toPoints] of PRESETS) {
      for (let stale = 0; stale < fromPoints.length; stale++) {
        for (const name of keys) {
          for (const shiftKey of [false, true]) {
            const result = tfKeyAction(cloneTfPoints(toPoints), stale, key(name, { shiftKey }))
            assert.ok(result, `${from} → ${to}: ${name}(番号 ${stale})が扱われていない`)
            assert.ok(result.selected >= 0 && result.selected < toPoints.length, `${from} → ${to}: ${name}(番号 ${stale})で選びが範囲の外 ${result.selected}`)
            assert.equal(result.points.length, toPoints.length)
          }
        }
      }
    }
  }
})

test('PageUp は前の点、PageDown は次の点(端で反対の端に回り、全部の点を 1 回ずつ通る)。Home・End は最初・最後', () => {
  const points = cloneTfPoints(TF_PRESETS['中身'])
  assert.equal(tfKeyAction(points, 3, key('PageDown')).selected, 4)
  assert.equal(tfKeyAction(points, 3, key('PageUp')).selected, 2)
  assert.equal(tfKeyAction(points, 0, key('PageUp')).selected, 7)
  assert.equal(tfKeyAction(points, 7, key('PageDown')).selected, 0)
  assert.equal(tfKeyAction(points, 5, key('Home')).selected, 0)
  assert.equal(tfKeyAction(points, 2, key('End')).selected, 7)
  const seen = new Set([0])
  let selected = 0
  for (let n = 1; n < points.length; n++) {
    selected = tfKeyAction(points, selected, key('PageDown')).selected
    seen.add(selected)
  }
  assert.equal(seen.size, points.length)
  // 選ぶだけのキーは点を動かさない(同じ配列を返す)
  assert.equal(tfKeyAction(points, 3, key('PageDown')).points, points)
})

test('Tab は点の移動に使わない(canvas から出るためのキー)。Alt・Ctrl・Cmd つきと、関係ないキーも扱わない', () => {
  const points = cloneTfPoints(TF_PRESETS['全部'])
  assert.equal(tfKeyAction(points, 2, key('Tab')), null)
  assert.equal(tfKeyAction(points, 2, key('Tab', { shiftKey: true })), null)
  assert.equal(tfKeyAction(points, 2, key('a')), null)
  assert.equal(tfKeyAction(points, 2, key('Enter')), null)
  for (const mod of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const name of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      assert.equal(tfKeyAction(points, 2, key(name, { [mod]: true })), null, `${mod} + ${name}`)
    }
  }
})

test('矢印キー: 左右が値、上下が不透明度(1 回 0.01、Shift で 5 倍)。色の位置 t は値に合わせる。元の配列は変えない', () => {
  const points = cloneTfPoints(TF_PRESETS['全部'])
  const before = JSON.stringify(points)
  const right = tfKeyAction(points, 3, key('ArrowRight'))
  near(right.points[3].value, 0.55 + 0.01)
  near(right.points[3].t, right.points[3].value)
  assert.equal(right.points[3].alpha, 0.18)
  const shiftLeft = tfKeyAction(points, 3, key('ArrowLeft', { shiftKey: true }))
  near(shiftLeft.points[3].value, 0.55 - 0.05)
  const up = tfKeyAction(points, 3, key('ArrowUp'))
  near(up.points[3].alpha, 0.19)
  assert.equal(up.points[3].value, 0.55)
  assert.equal(up.points[3].t, 0.67) // 上下では色の位置を変えない
  const shiftDown = tfKeyAction(points, 3, key('ArrowDown', { shiftKey: true }))
  near(shiftDown.points[3].alpha, 0.13)
  assert.equal(JSON.stringify(points), before, '元の配列を書き換えた')
  assert.notEqual(right.points, points)
  assert.notEqual(right.points[3], points[3])
})

test('動かせる範囲: 不透明度は 0〜1、値はとなりの点を 0.01 以上は越えず、最初は 0 以上・最後は 1 以下', () => {
  const points = cloneTfPoints(TF_PRESETS['全部'])
  // 端で動けないときは元の配列を返す(呼ぶ側が再描画を省ける)
  assert.equal(tfKeyAction(points, 0, key('ArrowDown')).points, points) // alpha 0 より下へは行かない
  assert.equal(tfKeyAction(points, 0, key('ArrowLeft')).points, points) // 値 0 より左へは行かない
  assert.equal(tfKeyAction(points, 5, key('ArrowRight')).points, points) // 値 1 より右へは行かない
  const big = movePoint(points, 5, { alpha: 9 })
  assert.equal(big[5].alpha, 1)
  assert.equal(movePoint(points, 5, { alpha: -9 })[5].alpha, 0)
  // となりを越えない
  const right = movePoint(points, 2, { value: 0.9 })
  near(right[2].value, points[3].value - TF_MIN_GAP)
  const left = movePoint(points, 2, { value: 0 })
  near(left[2].value, points[1].value + TF_MIN_GAP)
  assert.ok(right.every((point, i) => i === 0 || point.value > right[i - 1].value), '値の順が崩れた')
  // 最初の点は 0〜となりの手前、最後の点はとなりの先〜1
  assert.equal(movePoint(points, 0, { value: -3 })[0].value, 0)
  assert.equal(movePoint(points, 5, { value: 7 })[5].value, 1)
  // となりの点が 0.01 より近いデータ(エディタの操作では起きない)でも、落ちずに有限の値になる
  const tight = [{ value: 0, alpha: 0, t: 0 }, { value: 0.5, alpha: 0, t: 0.5 }, { value: 0.5025, alpha: 0, t: 0.5025 }, { value: 0.505, alpha: 0, t: 0.505 }, { value: 1, alpha: 0, t: 1 }]
  assert.doesNotThrow(() => movePoint(tight, 2, { value: 0.5 }))
  assert.ok(Number.isFinite(movePoint(tight, 2, { value: 0.5 })[2].value))
})

test('movePoint: 範囲の外の番号は端の点に丸め、点が 0 個なら何もしない(落ちない)', () => {
  const points = cloneTfPoints(TF_PRESETS['骨'])
  assert.doesNotThrow(() => movePoint(points, 99, { value: 0.9, alpha: 0.5 }))
  assert.doesNotThrow(() => movePoint(points, -5, { value: 0.1, alpha: 0.5 }))
  assert.doesNotThrow(() => movePoint(points, Number.NaN, { alpha: 0.5 }))
  near(movePoint(points, 99, { alpha: 0.5 })[3].alpha, 0.5)
  near(movePoint(points, -5, { alpha: 0.5 })[0].alpha, 0.5)
  const empty = []
  assert.equal(movePoint(empty, 0, { value: 0.5 }), empty)
  assert.equal(tfKeyAction(empty, 0, key('ArrowUp')), null)
  assert.equal(tfKeyAction(empty, 0, key('PageDown')), null)
  assert.equal(describePoint(empty, 0), '')
})

test('movePoint: ポインタで value と alpha を一度に動かすと、どちらも変わり、変わらなければ元の配列を返す', () => {
  const points = cloneTfPoints(TF_PRESETS['中身'])
  const moved = movePoint(points, 4, { value: 0.31, alpha: 0.5 })
  near(moved[4].value, 0.31)
  near(moved[4].t, 0.31)
  near(moved[4].alpha, 0.5)
  assert.equal(points[4].value, 0.3, '元の配列を書き換えた')
  assert.equal(movePoint(points, 4, { value: points[4].value, alpha: points[4].alpha }), points)
  assert.equal(movePoint(points, 4), points)
})

test('describePoint: 何番目の点か、値と不透明度を読み上げる文にする(古い番号は範囲に収める)', () => {
  const points = cloneTfPoints(TF_PRESETS['骨'])
  assert.equal(describePoint(points, 2), '点 3 / 4：値 0.88、不透明度 0.08')
  assert.equal(describePoint(points, 7), '点 4 / 4：値 1.00、不透明度 0.82')
  assert.equal(describePoint(points, 0), '点 1 / 4：値 0.00、不透明度 0.00')
})
