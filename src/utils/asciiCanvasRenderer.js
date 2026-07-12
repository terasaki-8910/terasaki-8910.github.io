// three/examples/jsm/effects/AsciiEffect.js は 1行おきサンプリング
// (y += 2, AsciiEffect.js:189) を等幅ラテン文字(courier new, 幅:高さ≈0.6:1)
// 前提で行っている。全角のかな・漢字は幅:高さ≈1:1のため、そのロジックのまま
// 使うと横方向に約2倍伸びて図形が歪む。ここでは自前でレンダリングし、
// 文字数=セル数の正方形グリッドで歪みをなくす。

// 隣接する文字の密度差が小さいと毎フレーム文字が入れ替わってチラつくため、
// 密度順に並んだ文字列から等間隔にlevels個だけ抜き出して階調を粗くする。
export function pickQuantizedLevels(sortedChars, levels = 6) {
  const chars = [...sortedChars]
  const result = []
  for (let i = 0; i < levels; i++) {
    const idx = Math.round((i * (chars.length - 1)) / (levels - 1))
    result.push(chars[idx])
  }
  return result
}

export function createAsciiCanvasRenderer({
  webglRenderer,
  canvas,
  targetCellSize = 6,
  getColor = () => '#B2FFFF',
  levelChars,
  fontFamily = '"Hiragino Sans", sans-serif',
}) {
  const sampleCanvas = document.createElement('canvas')
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
  const ctx = canvas.getContext('2d')

  let cols = 90
  let cellSize = 10
  let rows = 40
  let displayWidth = 0
  let displayHeight = 0

  function setSize(width, height) {
    displayWidth = width
    displayHeight = height
    // colsを固定値にすると、コンテナ幅が狭い(モバイル)ほどセルが小さくなり
    // 見かけ上の解像度が上がってしまう(幅が広い画面ほど粗く見える)。
    // 目標セルサイズから逆算して幅に応じてcols自体を変えることで、
    // ブレークポイントに関係なく密度を揃える。
    cols = Math.max(20, Math.round(width / targetCellSize))
    cellSize = width / cols
    rows = Math.max(1, Math.round(height / cellSize))

    sampleCanvas.width = cols
    sampleCanvas.height = rows

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    webglRenderer.setSize(cols, rows, false)
  }

  function render(scene, camera) {
    webglRenderer.render(scene, camera)
    sampleCtx.clearRect(0, 0, cols, rows)
    sampleCtx.drawImage(webglRenderer.domElement, 0, 0, cols, rows)
    const { data } = sampleCtx.getImageData(0, 0, cols, rows)

    ctx.clearRect(0, 0, displayWidth, displayHeight)
    ctx.font = `${Math.ceil(cellSize)}px ${fontFamily}`
    ctx.fillStyle = getColor()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const levels = levelChars.length

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4
        const alpha = data[i + 3]
        if (alpha < 16) continue // 透明(背景)のセルは文字を出さない

        const brightness = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255
        const levelIdx = Math.min(levels - 1, Math.floor((1 - brightness) * levels))
        if (levelIdx < 0) continue

        const ch = levelChars[levelIdx]
        ctx.fillText(ch, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2)
      }
    }
  }

  // 実際にWebGLへレンダリングしているcols×rowsの比率。カメラのaspectは
  // 表示領域の生のwidth/heightではなく、必ずこの値を使うこと(colsもrowsも
  // 整数に丸めているため、生のwidth/heightの比率とは微妙にズレる。
  // カメラ側だけ生の比率を使うと、3Dシーンが実際のサンプリンググリッドと
  // 微妙に異なる画角でレンダリングされ、端が意図せず切れることがある)。
  function getAspect() {
    return cols / rows
  }

  return { setSize, render, getAspect }
}
