// 節「変換・投影・補間・IK」のデータ。形は sections/index.js を見る。
// 仮の中身(C1)。段階 C2 の (i) が、説明・式・出典・シミュレーションを書き直す。
import DemoSim from '../sims/DemoSim.jsx'

export default {
  id: 'transform',
  title: '変換・投影・補間・IK',
  tabLabel: '変換・IK',
  description: '立方体を、モデル、視点、投影、画面の順に変換して描く。補間と逆運動学もここで扱う。',
  formulas: [
    {
      id: 'perspective',
      caption: '透視投影',
      tex: "\\begin{pmatrix} x' \\\\ y' \\end{pmatrix} = \\frac{f}{z}\\begin{pmatrix} x \\\\ y \\end{pmatrix}",
      symbols: [
        { tex: 'f', meaning: '焦点距離（投影面までの距離）', unit: '' },
        { tex: 'x,\\ y,\\ z', meaning: '視点から見た点の座標（z が奥行き）', unit: '' },
        { tex: "x',\\ y'", meaning: '投影面上の座標', unit: '' },
      ],
    },
  ],
  snippets: ['projection-perspectiveProject'],
  sources: [{ text: 'Akenine-Möller, Haines, Hoffman, Real-Time Rendering, 4th ed. (2018)' }],
  Sim: DemoSim,
}
