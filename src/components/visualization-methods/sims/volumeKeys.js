// ボリュームのタブの、キーで選ぶ操作の純粋な部分(React・canvas に依存しない。tests/vis-page/volumeKeys.test.js)。
// 選ぶのは PageUp(前)・PageDown(次)・Home(最初)・End(最後)。動かすのは矢印キー(Shift で 5 倍。rigidKit の arrowStep)。
// Alt・Ctrl・Cmd つきは、ブラウザの操作(Alt+← で戻る、Ctrl+PageDown でタブの切り替え)に残すので何もしない。
// Tab は canvas から出るためのキーなので、canvas の中の移動には使わない。
import { arrowStep } from '../../visualization/sims/rigidKit.js'

const plain = (event) => !(event.altKey || event.ctrlKey || event.metaKey)

// 選んでいる番号を 0〜count − 1 の範囲に収める。物の数が減っても(プリセットの切り替えなど)、範囲の外を指さない
export function clampIndex(index, count) {
  if (!(count > 0)) return 0
  const i = Number.isFinite(index) ? Math.trunc(index) : 0
  return Math.min(count - 1, Math.max(0, i))
}

// 前(delta = −1)・次(+1)の番号。端から先は反対の端に回る
export function cycleIndex(index, count, delta) {
  if (!(count > 0)) return 0
  return (((clampIndex(index, count) + delta) % count) + count) % count
}

// 選ぶキーを押したときの新しい番号。選ぶキーでない(または Alt・Ctrl・Cmd つき)なら null
export function selectKey(event, index, count) {
  if (!(count > 0) || !plain(event)) return null
  switch (event.key) {
    case 'PageUp': return cycleIndex(index, count, -1)
    case 'PageDown': return cycleIndex(index, count, 1)
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}

// 発光と吸収(段階 2): 点 count 個それぞれに、吸収 σ の丸と発光 Lₑ の丸がある(1 つの点で σ が左、Lₑ が右)。
// 全部の丸に、左から順(点ごとに σ、Lₑ)に 0〜2·count − 1 の番号を付ける
export const handleNumber = ({ kind, index }) => index * 2 + (kind === 'emission' ? 1 : 0)
export const handleAt = (number) => ({ kind: number % 2 === 0 ? 'sigma' : 'emission', index: Math.floor(number / 2) })

// 段階 2 のキー。{ selected } 選ぶ丸が変わる(PageUp・PageDown・Home・End は全部の丸を順に、← → は同じ種類の隣の点)か、
// { delta } 選んでいる丸の高さを動かす(↑ が正、Shift で 5 倍)か、扱わないキーなら null
export function barKey(event, selected, count) {
  const pick = selectKey(event, handleNumber(selected), count * 2)
  if (pick !== null) return { selected: handleAt(pick) }
  const step = arrowStep(event)
  if (!step) return null
  if (step.dx !== 0) return { selected: { kind: selected.kind, index: clampIndex(selected.index + Math.sign(step.dx), count) } }
  return { delta: step.dy }
}
