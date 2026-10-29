// 節「剛体と衝突」の段階のシミュレーション(rigidStep*.jsx)が共通で使う小さな補助。React には依存しない。
import { monoFont } from '../canvasFont.js'

// 段階の絵の余白(CSS px)。全体(DEFAULT_MARGIN)より詰めてある。左は y の目盛りの数、下は x の目盛りと軸の名前、上は y 軸の名前の分
export const STEP_MARGIN = { left: 38, right: 14, top: 24, bottom: 36 }
export const GRAB_SLOP_PX = 12 // 物の外側でも、このくらいまでならつかめる(指で触れやすいように)

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// lane の色(サイトの色のトークン。地に 3:1 以上)。colors は useCanvas の draw に渡るもの
export function laneColor(colors, n) {
  return `rgb(${colors.rgb[`lane-${n}`].join(' ')})`
}
export function laneAlpha(colors, n, a) {
  return colors.alpha(`lane-${n}`, a)
}

// 表示用の数。小数 d 桁。マイナスは U+2212(−)、-0 は 0
export function fmt(value, d = 2) {
  const text = Math.abs(value).toFixed(d)
  return value < 0 && Number(text) !== 0 ? `−${text}` : text
}
export const fmtVec = (v, d = 2) => `(${fmt(v[0], d)}, ${fmt(v[1], d)})`

// 矢印キーの押しかたを { dx, dy }(右・上が +1)にする。Shift で 5 倍。矢印キーでなければ null
export function arrowStep(event) {
  // Alt・Ctrl・Cmd つきはブラウザの操作(Alt+← で戻るなど)に残す
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key]
  if (!k) return null
  const m = event.shiftKey ? 5 : 1
  return { dx: k[0] * m, dy: k[1] * m }
}

// 円(世界の座標の中心 c、半径 r)を描く。view は makeView の結果
export function strokeFillCircle(ctx, view, c, r, { fill, stroke, lineWidth = 1.5, dash } = {}) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(view.sx(c[0]), view.sy(c[1]), r * view.scaleX, 0, Math.PI * 2)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    if (dash) ctx.setLineDash(dash)
    ctx.stroke()
  }
  ctx.restore()
}

// 画面の座標 (px, py) に小さな円(つまみ・印)を描く。半径は画面の px
export function markerCircle(ctx, px, py, radius, { fill, stroke, lineWidth = 1.5 } = {}) {
  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

// 文字(等幅)。align は 'left' | 'center' | 'right'、baseline は 'top' | 'middle' | 'bottom'
export function drawText(ctx, text, x, y, { color, size = 11, align = 'left', baseline = 'alphabetic' } = {}) {
  ctx.save()
  ctx.font = monoFont(size)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
  ctx.restore()
}
