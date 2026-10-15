// 節「変換・投影・補間・IK」の絵と操作が共有する小物。
// 計算の関数は src/utils/vis/ にあり、ここは canvas の文字の書体と数の表示、角度・範囲の小さな変換だけ。

// canvas の文字(ラベル)の書体指定。ページ本文と同じ書体をそのまま使う
export { uiFont } from '../canvasFont.js'

// 小数 digits 桁。-0.00 にならないようにする
export function fmt(v, digits = 2) {
  const r = Number(v.toFixed(digits))
  return (r === 0 ? 0 : r).toFixed(digits)
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const toRad = (deg) => (deg * Math.PI) / 180
export const toDeg = (rad) => (rad * 180) / Math.PI

// 角度を (-180, 180] の度にして表示用の文字列にする
export function fmtDeg(rad) {
  let d = toDeg(rad) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return fmt(d, 1)
}

// 角度(度)を [-180, 180) にする
export const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180

// step の倍数に丸める(0.05 刻みで 6.050000000000001 のような誤差を残さない)
export const roundTo = (v, step) => Number((Math.round(v / step) * step).toFixed(6))
