// 2 次元の絵の「つかめる物(取っ手)」: 当たり判定と、取っ手の描き方。DOM に触れない(描くときだけ ctx)。
// 段階 4〜6・8 が使う。つかめる物はどれも同じ見た目(丸・四角・ひし形のつまみ)で、つかむと大きく・ink で塗る。
import { uiFont } from './transformCommon.js'

// handles: [{ id, x, y, r? }](画面の座標。r は当たりの半径で、省略すると 16 px)。前の方が優先。
// (x, y) に一番近い取っ手(半径の内側のもの)。なければ null
export function pickHandle(handles, x, y) {
  let best = null
  let bestD = Infinity
  for (const h of handles) {
    const d = Math.hypot(h.x - x, h.y - y)
    if (d <= (h.r ?? 16) && d < bestD) {
      best = h
      bestD = d
    }
  }
  return best
}

// つまみ 1 つ。shape: 'circle' | 'square' | 'diamond'。fill は色(省略すると accent)、active はつかんでいる間
export function drawGrip(ctx, x, y, colors, { shape = 'circle', radius = 8.5, fill, active = false, label, dx = 0, dy = -16, labelColor, labelAlign = 'center' } = {}) {
  const r = active ? radius + 1.5 : radius
  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 2
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = active ? colors.ink : fill ?? colors.accent
  ctx.beginPath()
  if (shape === 'square') {
    ctx.rect(x - r, y - r, 2 * r, 2 * r)
  } else if (shape === 'diamond') {
    const d = r * 1.25
    ctx.moveTo(x, y - d)
    ctx.lineTo(x + d, y)
    ctx.lineTo(x, y + d)
    ctx.lineTo(x - d, y)
    ctx.closePath()
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  if (label) drawLabel(ctx, label, x + dx, y + dy, colors, { align: labelAlign, color: labelColor, halo: true })
}

// 補助: 文字(画面の座標)。halo を付けると、文字の後ろを地の色で塗る(線や図形の上に載っても読める)
export function drawLabel(ctx, text, x, y, colors, { size = 12, align = 'left', baseline = 'middle', color, halo = false } = {}) {
  ctx.save()
  ctx.font = uiFont(size)
  if (halo && ctx.measureText) {
    const w = ctx.measureText(text).width
    const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    const top = baseline === 'top' ? y : baseline === 'bottom' ? y - size : y - size / 2
    ctx.fillStyle = colors.alpha ? colors.alpha('surface', 0.85) : colors.surface
    ctx.fillRect(left - 2, top - 1, w + 4, size + 2)
  }
  ctx.fillStyle = color ?? colors.ink
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
  ctx.restore()
}

// 補助: 線(画面の座標)
export function drawSeg(ctx, x0, y0, x1, y1, { color, width = 1, dash = [] } = {}) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.restore()
}
