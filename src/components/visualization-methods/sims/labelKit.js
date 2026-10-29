// canvas の文字で、下付きの記号を書く(「f_A = 0.26」の _ の次の 1 文字か {…} を、小さく下げて描く)。
// canvas の文字に TeX の _ をそのまま出さないため(2026-10-26、画面の確かめで見つけた)。数は fmt(rigidKit)で − にする
import { monoFont } from '../../visualization/canvasFont'

export function splitSubscript(text) {
  const m = /^(.*?)_(\{[^}]*\}|.)(.*)$/.exec(text)
  if (!m) return null
  return { base: m[1], sub: m[2].replace(/^\{|\}$/g, ''), rest: m[3] }
}

export function drawSubLabel(ctx, text, x, y, { color, size = 11, align = 'left', baseline = 'alphabetic' } = {}) {
  const parts = splitSubscript(text)
  ctx.save()
  ctx.fillStyle = color
  ctx.textBaseline = baseline
  if (!parts) {
    ctx.font = monoFont(size)
    ctx.textAlign = align
    ctx.fillText(text, x, y)
    ctx.restore()
    return
  }
  const subSize = Math.round(size * 0.78)
  ctx.font = monoFont(size)
  const wBase = ctx.measureText(parts.base).width
  const wRest = ctx.measureText(parts.rest).width
  ctx.font = monoFont(subSize)
  const wSub = ctx.measureText(parts.sub).width
  const total = wBase + wSub + wRest
  let left = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  ctx.textAlign = 'left'
  ctx.font = monoFont(size)
  ctx.fillText(parts.base, left, y)
  left += wBase
  ctx.font = monoFont(subSize)
  ctx.fillText(parts.sub, left, y + size * 0.3)
  left += wSub
  ctx.font = monoFont(size)
  ctx.fillText(parts.rest, left, y)
  ctx.restore()
}
