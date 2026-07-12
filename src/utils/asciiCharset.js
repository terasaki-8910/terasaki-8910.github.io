// AsciiEffect(three/examples/jsm/effects/AsciiEffect.js)は
// iCharIdx = floor((1 - brightness) * (charSet.length - 1))
// で文字を選ぶ。つまり charSet は「明るいピクセル用(index 0)」→
// 「暗いピクセル用(末尾)」の順、視覚的な密度が低い(白っぽい)文字から
// 高い(黒っぽい)文字への並びにする必要がある。
//
// 漢字・カタカナ・半角カタカナは見た目の密度が字形によって直感と
// ズレるため、実際にcanvasへ描画してインク比率を測って並べ替える。
export function buildDensitySortedCharset(chars, fontFamily = 'sans-serif', size = 48) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const measureDensity = (char) => {
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#000000'
    ctx.font = `${Math.floor(size * 0.85)}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(char, size / 2, size / 2)

    const { data } = ctx.getImageData(0, 0, size, size)
    let inkPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (brightness < 200) inkPixels++
    }
    return inkPixels / (size * size)
  }

  return [...new Set(chars)]
    .map((char) => ({ char, density: measureDensity(char) }))
    .sort((a, b) => a.density - b.density)
    .map((c) => c.char)
    .join('')
}

export const NAME_CHARACTERS = [
  // 漢字(日野岡雅人・寺): 﨑は文字化けするため除外
  '日', '野', '岡', '雅', '人', '寺',
  // ひらがな
  'ひ', 'の', 'お', 'か', 'ま', 'さ', 'と',
  // カタカナ
  'ヒ', 'ノ', 'オ', 'カ', 'マ', 'サ', 'ト',
  // 半角カタカナ
  'ﾋ', 'ﾉ', 'ｵ', 'ｶ', 'ﾏ', 'ｻ', 'ﾄ',
]
