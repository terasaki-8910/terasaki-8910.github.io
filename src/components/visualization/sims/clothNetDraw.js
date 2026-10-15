// 網(clothWorld.js の世界)を canvas に描く。全体のシミュレーション(ClothSim.jsx)と段階 7 が使う。
// view は axes.js の makeView(世界の座標 → 画面)。色は useCanvas の colors のトークンだけ。
import { isPinned } from './clothWorld.js'

export const STRETCH_HIGHLIGHT = 0.1 // 自然長より 10 % 以上伸びた辺は色を変える

// 辺と質点を描く。
//   diagonals  true なら斜めのばね(拘束)も細い線で描く(縦横だけのときは描かない)
//   active     false の辺(斜めを外したとき)は描かない。省略すると全部の辺を対象にする
export function drawNet(ctx, view, world, colors, { diagonals = false } = {}) {
  const { pos } = world.state
  const springs = world.springs
  const px = (i) => view.sx(pos[2 * i])
  const py = (i) => view.sy(pos[2 * i + 1])
  const length = (s) => {
    const dx = pos[2 * s.j] - pos[2 * s.i]
    const dy = pos[2 * s.j + 1] - pos[2 * s.i + 1]
    return Math.sqrt(dx * dx + dy * dy)
  }
  const isStructural = (s) => s.L0 === world.spacing
  const stretched = (s) => length(s) > s.L0 * (1 + STRETCH_HIGHLIGHT)

  // 斜めの辺(細く)
  if (diagonals) {
    ctx.lineWidth = 1
    ctx.strokeStyle = colors.alpha('ink', 0.6)
    ctx.beginPath()
    for (const s of springs) {
      if (isStructural(s) || stretched(s)) continue
      ctx.moveTo(px(s.i), py(s.i))
      ctx.lineTo(px(s.j), py(s.j))
    }
    ctx.stroke()
  }
  // 縦横の辺。伸びた辺は別の色で太く(二度に分けて引く)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = colors.alpha('ink', 0.75)
  ctx.beginPath()
  for (const s of springs) {
    if (!isStructural(s) || stretched(s)) continue
    ctx.moveTo(px(s.i), py(s.i))
    ctx.lineTo(px(s.j), py(s.j))
  }
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = colors.alpha('diff-delete', 1) // 伸びすぎの警告の色(地に 4.7:1 以上。accent は 1.6:1 で見えない)
  ctx.beginPath()
  for (const s of springs) {
    if ((!diagonals && !isStructural(s)) || !stretched(s)) continue
    ctx.moveTo(px(s.i), py(s.i))
    ctx.lineTo(px(s.j), py(s.j))
  }
  ctx.stroke()

  // 質点。固定した質点は四角、つかんでいる質点は大きな丸
  ctx.fillStyle = colors.ink
  const n = world.state.n
  for (let i = 0; i < n; i++) {
    if (i === world.grab.index) continue
    if (isPinned(world, i)) ctx.fillRect(px(i) - 3.5, py(i) - 3.5, 7, 7)
    else ctx.fillRect(px(i) - 1.5, py(i) - 1.5, 3, 3)
  }
  if (world.grab.index >= 0) {
    const g = world.grab.index
    ctx.fillStyle = colors.accent
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px(g), py(g), 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

// 計算が発散したときの、絵の真ん中の短い言葉
export function drawDivergedNotice(ctx, width, height, colors, text) {
  ctx.save()
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(ctx.measureText(text).width + 28, width - 8)
  ctx.fillStyle = colors.surface
  ctx.fillRect((width - w) / 2, height / 2 - 20, w, 40)
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 1.5
  ctx.strokeRect((width - w) / 2, height / 2 - 20, w, 40)
  ctx.fillStyle = colors.ink
  ctx.fillText(text, width / 2, height / 2, w - 12)
  ctx.restore()
}
