// 4つの節。並びがそのままページの並び(id は節のアンカーとタブの id)。
// 節の文章・式・出典・シミュレーションは、節ごとのファイルに書く(ファイルを分けて、書き手がぶつからないように)。
// 節のデータの形:
//   id           節のアンカー(#transform など)とタブの id。変えない
//   title        h2 の見出し
//   tabLabel     案 C のタブの短い名前(省略すると title)
//   description  2〜4 文の説明(平文)
//   formulas     [{ id, caption, tex, symbols: [{ tex, meaning, unit }] }]
//                tex は KaTeX の TeX。symbols の unit も TeX(単位なしは '')
//   snippets     「実装を見る」に並べる抜粋の名前(src/utils/vis/*.js の // @snippet 名前)
//   sources      [{ text, href? }] 元の論文・教科書(確かなものだけ)
//   Sim          シミュレーションの React コンポーネント(返すのは SimShell)。無ければ空の枠
import transform from './transform.js'
import rigid from './rigid.js'
import cloth from './cloth.js'
import fluid from './fluid.js'

export const SECTIONS = [transform, rigid, cloth, fluid]
