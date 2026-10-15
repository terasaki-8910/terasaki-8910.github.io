// canvas に書く文字の書体。canvas の文字は CSS の書体と同じ名前で指定するが、読み込み前の書体は使えず、
// 読み込めても自動では描き直されない(useCanvas が fonts.ready のあとに 1 回描き直す)。

let bodyFont = null

// ページ本文と同じ書体(ラベルなど文章に近い文字)。size は px
export function uiFont(size) {
  if (bodyFont === null) {
    bodyFont = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif'
  }
  return `${size}px ${bodyFont}`
}

// 等幅の書体(目盛りの数など。桁がそろい、0 と O、1 と l が見分けられる)。size は px
export function monoFont(size) {
  return `${size}px "Fira Mono", "Zen Kurenaido", ui-monospace, monospace`
}
