// 画素の絵(RGBA)を canvas に描く。putImageData は ctx の変換(useCanvas が掛けた dpr 倍)を無視するので、
// dpr が 2 の画面(iPad・Mac)では絵が左上の 1/4 にしか出ない。いったん別の canvas に置き、drawImage で
// CSS px の位置と大きさに描く(2026-10-26、画面の確かめで見つけた)。
//   blitPixels(ctx, pixels, w, h)                      canvas の左上から w × h(CSS px)に
//   blitPixels(ctx, image, w, h, dx, dy, dw, dh)        (dx, dy) から dw × dh に拡大・縮小して
// pixels は Uint8ClampedArray(w × h × 4)か ImageData。smooth: false で拡大のときに画素をぼかさない
const buffers = new WeakMap()

export function blitPixels(ctx, pixels, width, height, dx = 0, dy = 0, dw = width, dh = height, { smooth = true } = {}) {
  let buffer = buffers.get(ctx)
  if (!buffer) {
    buffer = document.createElement('canvas')
    buffers.set(ctx, buffer)
  }
  if (buffer.width !== width || buffer.height !== height) {
    buffer.width = width
    buffer.height = height
  }
  const data = pixels instanceof ImageData ? pixels : new ImageData(pixels, width, height)
  buffer.getContext('2d').putImageData(data, 0, 0)
  const previous = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = smooth
  ctx.drawImage(buffer, dx, dy, dw, dh)
  ctx.imageSmoothingEnabled = previous
}
