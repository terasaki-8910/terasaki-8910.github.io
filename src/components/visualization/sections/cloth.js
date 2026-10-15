// 節「布（バネ-質点系と位置ベース法）」のデータ。形は sections/index.js を見る。
import ClothSim from '../sims/ClothSim.jsx'

export default {
  id: 'cloth',
  title: '布（バネ-質点系と位置ベース法）',
  tabLabel: '布',
  intro: '質点を辺でつないだ網を、バネ-質点系と位置ベース法のどちらでも動かして比べる。質点をつかんで揺らせて、風も吹かせられる。',
  overview: {
    Sim: ClothSim,
    caption: '方式を切り替えても、質点の位置と速度は引き継がれる。バネ-質点系は、Δt が安定の限界を超えると発散する。',
  },
  steps: [],
  combination: null,
  sources: [
    { text: 'Provot, Deformation constraints in a mass-spring model to describe rigid cloth behavior, Graphics Interface (1995)' },
    { text: 'Hairer, Lubich, Wanner, Geometric Numerical Integration, Springer (2002)' },
    { text: 'Müller, Heidelberger, Hennix, Ratcliff, Position Based Dynamics, Journal of Visual Communication and Image Representation 18(2) (2007)' },
    {
      text: 'Bender, Müller, Macklin, Position-Based Simulation Methods in Computer Graphics, Eurographics 2015 Tutorial',
      href: 'https://doi.org/10.2312/egt.20151045',
    },
    { text: 'Anderson, Fundamentals of Aerodynamics, 6th ed. (2017)' },
  ],

  // 段階に分ける前の式と抜粋と説明(sections/index.js を見る)。段階へ移し終えたら消す
  legacyFormulas: [
    {
      id: 'spring',
      caption: 'ばねの力と減衰',
      tex: '\\begin{aligned} \\mathbf{F}_1 &= \\left[ k\\,(L - L_0) + k_d\\,\\dot{L} \\right]\\mathbf{n}, \\qquad \\mathbf{F}_2 = -\\mathbf{F}_1 \\\\ \\mathbf{n} &= \\frac{\\mathbf{x}_2 - \\mathbf{x}_1}{L}, \\quad L = \\lVert \\mathbf{x}_2 - \\mathbf{x}_1 \\rVert, \\quad \\dot{L} = (\\mathbf{v}_2 - \\mathbf{v}_1)\\cdot\\mathbf{n} \\end{aligned}',
      symbols: [
        { tex: '\\mathbf{F}_1,\\ \\mathbf{F}_2', meaning: 'ばねが両端の質点 1・2 に与える力', unit: '\\mathrm{N}' },
        { tex: 'k', meaning: 'ばね定数', unit: '\\mathrm{N/m}' },
        { tex: 'k_d', meaning: '減衰係数', unit: '\\mathrm{N\\,s/m}' },
        { tex: 'L,\\ L_0', meaning: '今の長さと自然長', unit: '\\mathrm{m}' },
        { tex: '\\dot{L}', meaning: '長さの変化の速さ（相対速度のばねの向きの成分）', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '質点 1 から 2 へ向かう単位ベクトル', unit: '' },
      ],
    },
    {
      id: 'semi-implicit',
      caption: '半陰的オイラー法の更新',
      tex: '\\begin{aligned} \\mathbf{v}_{t+\\Delta t} &= \\mathbf{v}_t + \\Delta t\\left( \\mathbf{g} + \\frac{\\mathbf{F}_t}{m} \\right) \\\\ \\mathbf{x}_{t+\\Delta t} &= \\mathbf{x}_t + \\Delta t\\,\\mathbf{v}_{t+\\Delta t} \\end{aligned}',
      symbols: [
        { tex: 'm', meaning: '質点の質量', unit: '\\mathrm{kg}' },
        { tex: '\\mathbf{F}', meaning: 'ばね・減衰・空気抵抗・風の力の合計', unit: '\\mathrm{N}' },
        { tex: '\\mathbf{g}', meaning: '重力加速度', unit: '\\mathrm{m/s^2}' },
        { tex: '\\Delta t', meaning: '時間刻み（速度を先に更新し、新しい速度で位置を更新する）', unit: '\\mathrm{s}' },
      ],
    },
    {
      id: 'stability',
      caption: '安定の条件（質点 1 個とばね 1 本）',
      tex: '\\Delta t < \\frac{2}{\\omega} = 2\\sqrt{\\frac{m}{k}}, \\qquad \\omega = \\sqrt{\\frac{k}{m}}',
      symbols: [
        { tex: '\\omega', meaning: '固有角振動数（網では、いちばん速い振動の ω_max を使う）', unit: '\\mathrm{rad/s}' },
        { tex: 'm', meaning: '質量', unit: '\\mathrm{kg}' },
        { tex: 'k', meaning: 'ばね定数', unit: '\\mathrm{N/m}' },
      ],
    },
    {
      id: 'aero',
      caption: '風の抗力と揚力',
      tex: '\\mathbf{D} = \\tfrac{1}{2}\\,C_D\\,\\rho\\,S\\,\\lVert \\mathbf{U} \\rVert\\,\\mathbf{U}, \\qquad \\mathbf{L} = \\tfrac{1}{2}\\,C_L\\,\\rho\\,S\\,(\\mathbf{U} \\times \\mathbf{n}) \\times \\mathbf{U}',
      symbols: [
        { tex: '\\mathbf{U}', meaning: '板に対する空気の速度（風の速度 − 板の速度）', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '板の単位法線（風下を向く側）', unit: '' },
        { tex: 'S', meaning: '板の面積（辺の長さ × 奥行き）', unit: '\\mathrm{m^2}' },
        { tex: '\\rho', meaning: '空気の密度', unit: '\\mathrm{kg/m^3}' },
        { tex: 'C_D', meaning: '抗力係数', unit: '' },
        { tex: 'C_L', meaning: '揚力係数（この式は板が風と平行なとき最大になるので、初期値は 0）', unit: '' },
      ],
    },
    {
      id: 'pbd-distance',
      caption: '位置ベース法の距離の拘束の補正',
      tex: '\\begin{aligned} C(\\mathbf{p}_1, \\mathbf{p}_2) &= \\lVert \\mathbf{p}_1 - \\mathbf{p}_2 \\rVert^2 - d^2 = 0 \\\\ \\Delta\\mathbf{p}_i &= \\lambda\\, w_i\\, \\nabla_{\\mathbf{p}_i} C, \\qquad \\lambda = -\\frac{C}{\\sum_j w_j\\, \\lVert \\nabla_{\\mathbf{p}_j} C \\rVert^2} \\end{aligned}',
      symbols: [
        { tex: '\\mathbf{p}_i', meaning: '質点 i の予測位置（速度で進めただけの位置）', unit: '\\mathrm{m}' },
        { tex: 'd', meaning: '2 点を保つ距離（自然長）', unit: '\\mathrm{m}' },
        { tex: 'w_i', meaning: '質量の逆数（固定した質点は 0）', unit: '\\mathrm{1/kg}' },
        { tex: '\\Delta\\mathbf{p}_i', meaning: '質点 i の位置の補正', unit: '\\mathrm{m}' },
        { tex: '\\lambda', meaning: '補正の大きさを決める係数', unit: '\\mathrm{kg}' },
      ],
    },
  ],
  legacySnippets: [
    'massSpring-springForce',
    'massSpring-massSpringStep',
    'massSpring-criticalDt',
    'massSpring-aeroForce',
    'massSpring-addWindForces',
    'pbd-projectDistance',
    'pbd-solveConstraints',
    'pbd-pbdStep',
  ],
  legacyDescription:
    '質点を辺でつないだ 2 次元の網を、2 通りの方法で動かして比べる。質点-ばね系は、ばねと減衰の力から加速度を求めて半陰的オイラー法で進めるので、時間刻みが安定の限界を超えると崩れる。位置ベース法は、辺の長さを保つように予測位置を直接動かし、速度は位置の変化から決めるので、時間刻みを大きくしても崩れにくい。風は、辺を板とみなして抗力と揚力を加える。',
}
