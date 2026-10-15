// 4 つの節(タブ)。並びがそのままタブの並び(id は URL の # とタブの id)。
// 節の文章・式・出典・シミュレーションは、節ごとのファイルに書く(ファイルを分けて、書き手がぶつからないように)。
//
// 節のデータの形(第 2 版。tests/vis-page/sections.test.js が検査する):
//   id           URL の #id とタブの id(transform / rigid / cloth / fluid)。変えない
//   tabLabel     タブの短い名前
//   title        h2 の見出し
//   intro        何のシミュレーションかの 1〜2 文(平文)
//   overview     全体のシミュレーション: { Sim, caption }
//                  Sim      React コンポーネント(返すのは SimShell)。lazy で包んでよい
//                  caption  シミュレーションの下に出す一言(平文。何を動かせて、何が見えるか)
//   steps        段階(計算ごとの小さなシミュレーション)。[] なら段階の欄は出ない。1 つは:
//                  { id,                      段階の id(節の中で重ならない。a-z0-9-)
//                    title,                   名前(番号は並びから自動)
//                    text,                    その計算が何をしているかの説明(1〜3 文、高校数学の言葉)
//                    formulas: [{ tex, symbols?: [{ tex, meaning, unit }] }],
//                                             一般形の式と主な記号。tex は KaTeX の TeX。unit も TeX(単位なしは '')
//                    snippets: [名前],        「実装を見る」に並べる抜粋(src/utils/vis/*.js の // @snippet 名前)
//                    Sim }                    React コンポーネント(返すのは SimShell。小さい高さは自動)
//   combination  組み合わせ: { text?, flow: [{ steps: [番号], text }] }。番号は段階の並び(1 始まり)。
//                段階が空のあいだは null
//   sources      [{ text, href? }] 元の論文・教科書(確かなものだけ)
//
// 段階に分ける前の式と抜粋は、次の名前で残してある(段階を作る人が、各段階の formulas・snippets へ移す。
// 移し終えたら消す。残っているあいだは、節の「全体」の下の「この節で使う式と実装のまとめ」に出る):
//   legacyDescription  第 1 版の description(2〜4 文の説明。画面には出ない)
//   legacyFormulas     第 1 版の formulas([{ id, caption, tex, symbols }])
//   legacySnippets     第 1 版の snippets
import transform from './transform.js'
import rigid from './rigid.js'
import cloth from './cloth.js'
import fluid from './fluid.js'

export const SECTIONS = [transform, rigid, cloth, fluid]
