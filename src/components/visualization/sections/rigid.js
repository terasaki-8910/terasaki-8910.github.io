// 節「剛体と衝突」のデータ。形は sections/index.js を見る。
import RigidSim from '../sims/RigidSim.jsx'

export default {
  id: 'rigid',
  title: '剛体と衝突',
  tabLabel: '剛体',
  description:
    '箱の中の円が、重力で落ちて壁や円どうしにぶつかる。位置と速度は前進オイラー法で小さく刻んで進め、ぶつかったら撃力で速度を直接変える。全部の組を調べる代わりに、AABB と Sweep and Prune で候補を絞ってから円の重なりを調べる。反発係数 e が 0 ならはね返らず、1 なら損失がないが、前進オイラー法ではエネルギーが少しずつ増えるので、サブステップを増やして抑える。',
  formulas: [
    {
      id: 'euler',
      caption: '前進オイラー法',
      tex: '\\begin{aligned} \\mathbf{x}_{t+\\Delta t} &= \\mathbf{x}_t + \\Delta t\\,\\mathbf{v}_t \\\\ \\mathbf{v}_{t+\\Delta t} &= \\mathbf{v}_t + \\Delta t\\,\\mathbf{g} \\end{aligned}',
      symbols: [
        { tex: '\\mathbf{x}', meaning: '円の中心の位置', unit: '\\mathrm{m}' },
        { tex: '\\mathbf{v}', meaning: '速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{g}', meaning: '重力加速度（下向き）', unit: '\\mathrm{m/s^2}' },
        { tex: '\\Delta t', meaning: '時間刻み（1/60 s をサブステップの数で割った値）', unit: '\\mathrm{s}' },
      ],
    },
    {
      id: 'restitution',
      caption: '反発係数と壁での反発',
      tex: 'e = -\\frac{v_n^{\\prime}}{v_n}, \\qquad \\mathbf{v}_r = \\mathbf{v} - (1+e)\\,(\\mathbf{v}\\cdot\\mathbf{n})\\,\\mathbf{n}',
      symbols: [
        { tex: 'e', meaning: '反発係数（0 ならはね返らず、1 なら損失なし）', unit: '' },
        { tex: 'v_n,\\ v_n^{\\prime}', meaning: '衝突の前後の、面に垂直な向きの速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{v},\\ \\mathbf{v}_r', meaning: '衝突の前の速度と、はね返った後の速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '壁の、箱の内側を向く単位法線', unit: '' },
      ],
    },
    {
      id: 'circle-overlap',
      caption: '円の重なり判定',
      tex: '\\lVert \\mathbf{c}_1 - \\mathbf{c}_2 \\rVert \\le r_1 + r_2 \\iff \\lVert \\mathbf{c}_1 - \\mathbf{c}_2 \\rVert^2 \\le (r_1 + r_2)^2',
      symbols: [
        { tex: '\\mathbf{c}_1,\\ \\mathbf{c}_2', meaning: '2 つの円の中心', unit: '\\mathrm{m}' },
        { tex: 'r_1,\\ r_2', meaning: '半径', unit: '\\mathrm{m}' },
      ],
    },
    {
      id: 'aabb-overlap',
      caption: 'AABB の重なり判定',
      tex: '\\left(a_k^{\\min} \\le b_k^{\\max}\\right) \\land \\left(b_k^{\\min} \\le a_k^{\\max}\\right) \\quad (k = x,\\ y)',
      symbols: [
        { tex: 'a_k^{\\min},\\ a_k^{\\max}', meaning: '箱 a の、k 軸での最小値と最大値（円なら中心 ± 半径）', unit: '\\mathrm{m}' },
        { tex: 'b_k^{\\min},\\ b_k^{\\max}', meaning: '箱 b の、k 軸での最小値と最大値', unit: '\\mathrm{m}' },
      ],
    },
    {
      id: 'impulse',
      caption: '撃力による衝突の応答',
      tex: 'j = \\frac{(1+e)\\,(\\mathbf{v}_1 - \\mathbf{v}_2)\\cdot\\mathbf{n}}{1/m_1 + 1/m_2}, \\qquad \\mathbf{v}_1^{\\prime} = \\mathbf{v}_1 - \\frac{j}{m_1}\\mathbf{n}, \\quad \\mathbf{v}_2^{\\prime} = \\mathbf{v}_2 + \\frac{j}{m_2}\\mathbf{n}',
      symbols: [
        { tex: 'j', meaning: '撃力の大きさ（力を一瞬だけ加えた量）', unit: '\\mathrm{N\\,s}' },
        { tex: 'm_1,\\ m_2', meaning: '質量（つかんでいる円は無限大として扱う）', unit: '\\mathrm{kg}' },
        { tex: '\\mathbf{v}_1,\\ \\mathbf{v}_2', meaning: '衝突の前の速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '円 1 から円 2 へ向かう単位法線', unit: '' },
      ],
    },
  ],
  snippets: [
    'integrate-eulerStep',
    'collide-reflectVelocity',
    'collide-circlesOverlap',
    'collide-aabbOverlap',
    'collide-sweepAndPrune',
    'collide-resolveCircles',
  ],
  sources: [
    { text: 'Baraff, An Introduction to Physically Based Modeling: Rigid Body Simulation II, SIGGRAPH Course Notes (1997)' },
    { text: 'Ericson, Real-Time Collision Detection, Morgan Kaufmann (2004)' },
    { text: 'Hairer, Nørsett, Wanner, Solving Ordinary Differential Equations I, 2nd ed., Springer (1993)' },
  ],
  Sim: RigidSim,
}
