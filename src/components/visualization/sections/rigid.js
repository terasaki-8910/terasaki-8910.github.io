// 節「剛体と衝突」のデータ。形は sections/index.js を見る。
// 仮の中身(C1)。段階 C2 の (ii) が、説明・式・出典・シミュレーションを書き直す。
export default {
  id: 'rigid',
  title: '剛体と衝突',
  tabLabel: '剛体',
  description: '箱の中の円が壁と円どうしで衝突する。反発係数を変えると、はね返り方が変わる。',
  formulas: [
    {
      id: 'reflect',
      caption: '面での反発',
      tex: '\\mathbf{v}_r = \\mathbf{v} - (1+e)\\,(\\mathbf{v}\\cdot\\mathbf{n})\\,\\mathbf{n}',
      symbols: [
        { tex: '\\mathbf{v}', meaning: '衝突前の速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '面の外向きの単位法線', unit: '' },
        { tex: 'e', meaning: '反発係数（0 ならはね返らず、1 なら損失なし）', unit: '' },
      ],
    },
  ],
  snippets: ['collide-reflectVelocity'],
  sources: [{ text: 'Baraff, An Introduction to Physically Based Modeling: Rigid Body Simulation II, SIGGRAPH Course Notes (1997)' }],
}
