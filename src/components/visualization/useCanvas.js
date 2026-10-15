import { useCallback, useEffect, useRef } from 'react'

// canvas の大きさ・解像度・色の面倒を見る。
//   const { canvasRef, redraw, getColors } = useCanvas({ draw })
//   <canvas ref={canvasRef} className="vis-canvas" />        (SimCanvas.jsx が role と aria-label も付ける)
//   draw({ ctx, width, height, dpr, colors }) は CSS ピクセルの座標で描く(ctx は dpr 倍済み。clearRect 済み)。
//   redraw() は最新の draw をもう一度呼ぶ。パラメータが変わったとき、止まっている間も呼ぶ。
// 大きさは CSS が決める(SimShell が --aspect で縦横比を固定、幅は列いっぱい)。ここは canvas の親の幅だけを
// ResizeObserver で見て、解像度(dpr は上限 2)を合わせる。body の大きさは毎フレーム変えない。
// 色は html の --color-* から読む。data-theme が変わったら読み直して描き直す。16進の色はコードに書かない。

const MAX_DPR = 2

function parseColor(str) {
  const s = str.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16))
  m = /^rgba?\(([^)]+)\)/i.exec(s)
  if (m) return m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
  // "250 160 160"(アクセントのように、チャンネル値だけの変数)
  const nums = s.split(/\s+/).map(Number)
  if (nums.length === 3 && nums.every((n) => Number.isFinite(n))) return nums
  return [0, 0, 0]
}

export function readColors() {
  const style = getComputedStyle(document.documentElement)
  const token = (name) => style.getPropertyValue(`--color-${name}`).trim()
  const rgb = {}
  for (const name of ['paper', 'surface', 'ink', 'muted', 'line', 'accent', 'on-accent']) rgb[name] = parseColor(token(name))
  // データの色(--lane-*。背景に対して 3:1 以上を検証済み。accent は淡い地に 1.6:1 しかなく、図形の色には使えない)
  for (const name of ['lane-0', 'lane-1', 'lane-2', 'lane-3', 'lane-4']) rgb[name] = parseColor(style.getPropertyValue(`--${name}`))
  // accent と on-accent は「250 160 160」のようなチャンネル値で持っているので、rgb() にする
  const channels = (name) => `rgb(${rgb[name].join(' ')})`
  return {
    paper: token('paper'),
    surface: token('surface'),
    ink: token('ink'),
    muted: token('muted'),
    line: token('line'),
    accent: channels('accent'),
    onAccent: channels('on-accent'),
    rgb, // { ink: [r, g, b], 'on-accent': [...], ... }
    // 不透明度つきの色: colors.alpha('ink', 0.3)
    alpha: (name, a) => `rgb(${rgb[name === 'onAccent' ? 'on-accent' : name].join(' ')} / ${a})`,
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
  }
}

export default function useCanvas({ draw, maxDpr = MAX_DPR } = {}) {
  const canvasRef = useRef(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const colorsRef = useRef(null)

  const getColors = useCallback(() => {
    if (!colorsRef.current) colorsRef.current = readColors()
    return colorsRef.current
  }, [])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const { width, height, dpr } = sizeRef.current
    if (!canvas || !width || !height) return
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    drawRef.current?.({ ctx, width, height, dpr, colors: getColors() })
  }, [getColors])

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return undefined

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      sizeRef.current = { width, height, dpr }
      redraw()
    }
    colorsRef.current = readColors()
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(parent)
    const themeObserver = new MutationObserver(() => {
      colorsRef.current = readColors()
      redraw()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [maxDpr, redraw])

  return { canvasRef, redraw, getColors, sizeRef }
}
