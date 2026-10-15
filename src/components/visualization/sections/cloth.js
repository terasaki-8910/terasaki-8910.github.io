// 節「布（バネ-質点系と位置ベース法）」のデータ。形は sections/index.js を見る。
// 仮の中身(C1)。段階 C2 の (ii) が、説明・式・出典・シミュレーションを書き直す。
export default {
  id: 'cloth',
  title: '布（バネ-質点系と位置ベース法）',
  tabLabel: '布',
  description: '質点をバネでつないだ網を、力から進める方法と、拘束を直接満たす方法で動かして比べる。',
  formulas: [
    {
      id: 'spring',
      caption: 'バネの力',
      tex: '\\mathbf{F} = \\left[ k\\,(L - L_0) + k_d\\,\\dot{L} \\right]\\mathbf{n}',
      symbols: [
        { tex: 'k', meaning: 'ばね定数', unit: '\\mathrm{N/m}' },
        { tex: 'k_d', meaning: '減衰係数', unit: '\\mathrm{N\\,s/m}' },
        { tex: 'L,\\ L_0', meaning: '今の長さと自然長', unit: '\\mathrm{m}' },
      ],
    },
  ],
  snippets: ['massSpring-springForce'],
  sources: [{ text: 'Provot, Deformation constraints in a mass-spring model to describe rigid cloth behavior, Graphics Interface (1995)' }],
}
