// src/utils/vis/*.js の中の「// @snippet 名前」〜「// @end」を取り出す(DOM にも Vite にも依存しない。
// tests/vis-page/snippets.test.js が Node から読む)。「実装を見る」(CodeExcerpt.jsx)は、
// ソースを手で写さず、テストを通したファイルの本物の抜粋をそのまま見せるために使う。
// 名前は「ファイル名-関数名」(例: collide-reflectVelocity)。ファイル名は名前の最初の「-」まで。

const START = /^\s*\/\/\s*@snippet\s+(\S+)\s*$/
const END = /^\s*\/\/\s*@end\s*$/

// テキストの中の抜粋を、出てくる順に [{ name, code }] で返す。@end の無い @snippet は捨てずに throw する
export function listSnippets(text) {
  const out = []
  let current = null
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const start = START.exec(line)
    if (start) {
      if (current) throw new Error(`@snippet ${current.name} の @end がないまま、次の @snippet ${start[1]} が来ました (${i + 1} 行目)`)
      current = { name: start[1], lines: [] }
      continue
    }
    if (END.test(line)) {
      if (!current) throw new Error(`@snippet のない @end があります (${i + 1} 行目)`)
      out.push({ name: current.name, code: current.lines.join('\n').replace(/\s+$/, '') })
      current = null
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) throw new Error(`@snippet ${current.name} の @end がありません`)
  return out
}

// 名前に合う抜粋のコード。なければ null
export function extractSnippet(text, name) {
  const found = listSnippets(text).find((s) => s.name === name)
  return found ? found.code : null
}

// 抜粋の名前から、それがあるファイル名(拡張子なし)を引く
export function snippetFile(name) {
  const i = name.indexOf('-')
  return i < 0 ? name : name.slice(0, i)
}
