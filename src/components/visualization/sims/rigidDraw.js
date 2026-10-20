// 剛体の本体とホームのプレビューで、円の描き方を揃える。つかんだ円は最後に重ねる。
export function drawCircles(ctx, view, world, colors) {
  const scale = view.scaleX
  const px = view.sx
  const py = view.sy

  // 円
  ctx.lineWidth = 1.5
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = colors.alpha('accent', 0.6)
  for (let i = 0; i < world.n; i++) {
    const b = world.circles[i]
    if (i === world.grab.index) continue
    ctx.beginPath()
    ctx.arc(px(b.c[0]), py(b.c[1]), b.r * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (world.grab.index >= 0) {
    const b = world.circles[world.grab.index]
    ctx.fillStyle = colors.accent
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(px(b.c[0]), py(b.c[1]), b.r * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
