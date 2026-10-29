// 伝達関数(TransferFunctionEditor.jsx)の、プリセットと、点の選び方・動かし方。React・canvas に依存しない純粋な部分
// (tests/vis-page/transferFunctionEditor.test.js)。volumeKit.js が TF_PRESETS・cloneTfPoints をそのまま再び出す。
// points は値の小さい順の [{ value, alpha, t }]。value は体積データの値(0〜1)、alpha は不透明度(0〜1)、t は色の位置(0〜1)。
import { arrowStep, clamp } from '../../visualization/sims/rigidKit.js'
import { clampIndex, selectKey } from './volumeKeys.js'

export const TF_PRESETS = {
  '骨': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.72, alpha: 0, t: 0.7 },
    { value: 0.88, alpha: 0.08, t: 0.88 },
    { value: 1, alpha: 0.82, t: 1 },
  ],
  // 中(値 0.2)はごく薄く、小さな塊(0.3)を濃く、空洞(0)は透明、外の殻(1)は輪郭が分かる程度に
  '中身': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.16, alpha: 0, t: 0.2 },
    { value: 0.2, alpha: 0.006, t: 0.3 },
    { value: 0.25, alpha: 0.01, t: 0.45 },
    { value: 0.3, alpha: 0.4, t: 0.7 },
    { value: 0.36, alpha: 0, t: 0.75 },
    { value: 0.85, alpha: 0, t: 0.85 },
    { value: 1, alpha: 0.18, t: 1 },
  ],
  '全部': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.12, alpha: 0.015, t: 0.12 },
    { value: 0.26, alpha: 0.11, t: 0.38 },
    { value: 0.55, alpha: 0.18, t: 0.67 },
    { value: 0.82, alpha: 0.36, t: 0.86 },
    { value: 1, alpha: 0.72, t: 1 },
  ],
}

export const cloneTfPoints = (points) => points.map((point) => ({ ...point }))

export const TF_MIN_GAP = 0.01 // となりの点と、値がこれより近づかない
export const TF_KEY_STEP = 0.01 // 矢印キー 1 回の量(Shift で 5 倍)

// 点 index を動かした新しい点の列(元の列は変えない)。value はとなりの点を越えない範囲に収め、色の位置 t は value に合わせる。
// alpha は 0〜1。渡さなかった方は動かさない。index は点の数の範囲に収める(点の数が減ったあとの古い番号でも落ちない)。
// 端で動けないなど、値が何も変わらないときは、元の列をそのまま返す(呼ぶ側が再描画を省ける)
export function movePoint(points, index, { value, alpha } = {}) {
  if (points.length === 0) return points
  const i = clampIndex(index, points.length)
  const next = points.map((point) => ({ ...point }))
  if (value !== undefined) {
    const low = i === 0 ? 0 : next[i - 1].value + TF_MIN_GAP
    const high = i === next.length - 1 ? 1 : next[i + 1].value - TF_MIN_GAP
    next[i].value = clamp(value, low, Math.max(low, high))
    next[i].t = next[i].value
  }
  if (alpha !== undefined) next[i].alpha = clamp(alpha, 0, 1)
  return next[i].value === points[i].value && next[i].alpha === points[i].alpha ? points : next
}

// キー 1 回の結果。{ selected, points }(選んでいる点の新しい番号と、点の列。動かしていなければ points は同じ配列)か、
// このエディタが扱わないキー(Tab、Alt・Ctrl・Cmd つき、矢印・PageUp・PageDown・Home・End 以外)なら null。
// PageUp = 前の点、PageDown = 次の点(端で回る)、Home・End = 最初・最後の点、矢印 = 選んでいる点を動かす(左右が値、上下が不透明度)
export function tfKeyAction(points, selected, event) {
  if (points.length === 0) return null
  const i = clampIndex(selected, points.length)
  const pick = selectKey(event, i, points.length)
  if (pick !== null) return { selected: pick, points }
  const step = arrowStep(event)
  if (!step) return null
  const point = points[i]
  const next = step.dx !== 0
    ? movePoint(points, i, { value: point.value + step.dx * TF_KEY_STEP })
    : movePoint(points, i, { alpha: point.alpha + step.dy * TF_KEY_STEP })
  return { selected: i, points: next }
}

// 読み上げ用の文(キーで選んだ・動かしたときに、非表示の欄へ書く)
export function describePoint(points, index) {
  const i = clampIndex(index, points.length)
  const point = points[i]
  if (!point) return ''
  return `点 ${i + 1} / ${points.length}：値 ${point.value.toFixed(2)}、不透明度 ${point.alpha.toFixed(2)}`
}
