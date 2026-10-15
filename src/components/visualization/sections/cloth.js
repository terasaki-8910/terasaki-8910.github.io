// 節「布（バネ-質点系と位置ベース法）」のデータ。形は sections/index.js を見る。
// 全体は sims/ClothSim.jsx、段階 1〜9 は sims/clothStep1〜9.jsx(段階 2・4・5 は clothOscillator.jsx の variant 違い)。
// どれも、この節を開くまで・段階は画面に近づくまで読み込まない。
import { lazy } from 'react'

const ClothSim = lazy(() => import('../sims/ClothSim.jsx'))
const Step1 = lazy(() => import('../sims/clothStep1.jsx'))
const Step2 = lazy(() => import('../sims/clothStep2.jsx'))
const Step3 = lazy(() => import('../sims/clothStep3.jsx'))
const Step4 = lazy(() => import('../sims/clothStep4.jsx'))
const Step5 = lazy(() => import('../sims/clothStep5.jsx'))
const Step6 = lazy(() => import('../sims/clothStep6.jsx'))
const Step7 = lazy(() => import('../sims/clothStep7.jsx'))
const Step8 = lazy(() => import('../sims/clothStep8.jsx'))
const Step9 = lazy(() => import('../sims/clothStep9.jsx'))

export default {
  id: 'cloth',
  title: '布（バネ-質点系と位置ベース法）',
  tabLabel: '布',
  intro:
    '質点を辺でつないだ網（布）を、バネ-質点系と位置ベース法のどちらでも動かして比べる。質点をつかんで揺らせて、風も吹かせられる。下の段階 1〜9 で、1 本のバネから網ができるまでを順に確かめる。',
  overview: {
    Sim: ClothSim,
    caption:
      '質点をつかんで揺らせる（矢印キーでは網全体を弾く）。方式を切り替えても、質点の位置と速度は引き継がれる。バネ-質点系は、Δt が安定の限界を超えると発散する。',
  },
  steps: [
    {
      id: 'hooke',
      title: 'フックの法則',
      text: 'バネを自然の長さから x だけ伸ばす（縮める）と、元の長さに戻そうとする力が生まれる。この力の大きさは伸び x に比例し、向きは伸びと逆向きで、F = −kx と書く（k が大きいほど硬いバネ）。おもりをつかんで引くと、矢印の長さとグラフの点が、この式のとおりに動く。',
      formulas: [
        {
          caption: '1 本の横向きのバネ',
          tex: 'F = -k\\,x, \\qquad x = L - L_0',
          symbols: [
            { tex: 'F', meaning: 'バネがおもりに与える力（右向きが正）', unit: '\\mathrm{N}' },
            { tex: 'k', meaning: 'ばね定数（硬さ）', unit: '\\mathrm{N/m}' },
            { tex: 'x', meaning: '伸び（右へ伸びる向きが正）', unit: '\\mathrm{m}' },
            { tex: 'L,\\ L_0', meaning: '今の長さと自然長', unit: '\\mathrm{m}' },
          ],
        },
        {
          caption: 'バネが斜めを向いているとき（網のバネはこれ）',
          tex: '\\mathbf{F}_1 = k\\,(L - L_0)\\,\\mathbf{n}, \\qquad \\mathbf{F}_2 = -\\mathbf{F}_1, \\qquad \\mathbf{n} = \\frac{\\mathbf{x}_2 - \\mathbf{x}_1}{L}',
          symbols: [
            { tex: '\\mathbf{F}_1,\\ \\mathbf{F}_2', meaning: 'バネが両端の質点 1・2 に与える力', unit: '\\mathrm{N}' },
            { tex: '\\mathbf{n}', meaning: '質点 1 から 2 へ向かう長さ 1 のベクトル（バネの向き）', unit: '' },
            { tex: 'L', meaning: '質点 1・2 の距離 ‖x₂ − x₁‖', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['massSpring-springForce'],
      Sim: Step1,
    },
    {
      id: 'oscillation',
      title: '単振動',
      text: 'おもりを引いて離すと、行ったり来たりの往復運動になる。運動方程式 ma = F に F = −kx を入れると、加速度が位置に比例して向きが逆になる運動（単振動）になり、1 往復の時間（周期）は T = 2π√(m/k)。重いおもり・柔らかいバネほどゆっくり動く。',
      formulas: [
        {
          tex: 'm\\,a = -k\\,x \\;\\Longrightarrow\\; x(t) = x_0 \\cos(\\omega t), \\qquad \\omega = \\sqrt{\\frac{k}{m}}, \\qquad T = \\frac{2\\pi}{\\omega} = 2\\pi\\sqrt{\\frac{m}{k}}',
          symbols: [
            { tex: 'm', meaning: 'おもりの質量', unit: '\\mathrm{kg}' },
            { tex: 'a', meaning: '加速度', unit: '\\mathrm{m/s^2}' },
            { tex: 'x_0', meaning: '離したときの伸び（振幅）', unit: '\\mathrm{m}' },
            { tex: '\\omega', meaning: '角振動数', unit: '\\mathrm{rad/s}' },
            { tex: 'T', meaning: '周期（1 往復の時間）', unit: '\\mathrm{s}' },
          ],
        },
      ],
      snippets: ['massSpring-massSpringStep'],
      Sim: Step2,
    },
    {
      id: 'time-stepping',
      title: '時間の進め方',
      text: 'コンピュータは時間を Δt ずつ区切って進める。速度は「Δt のあいだに位置が進む量 ÷ Δt」、加速度は「Δt のあいだに速度が変わる量 ÷ Δt」なので、v ← v + Δt·a と x ← x + Δt·v の 2 つで更新する。この順番で結果が変わり、古い速度で位置を進める前進オイラー法は、バネでエネルギーが毎ステップ (1 + kΔt²/m) 倍に増え続けるが、先に速度を更新して新しい速度で位置を進める半陰的オイラー法は増え続けない。',
      formulas: [
        {
          caption: '前進オイラー法（古い速度で位置を進める）',
          tex: 'x_{n+1} = x_n + \\Delta t\\, v_n, \\qquad v_{n+1} = v_n + \\Delta t\\, a_n',
        },
        {
          caption: '半陰的オイラー法（新しい速度で位置を進める）',
          tex: '\\begin{aligned} \\mathbf{v}_{t+\\Delta t} &= \\mathbf{v}_t + \\Delta t\\left( \\mathbf{g} + \\frac{\\mathbf{F}_t}{m} \\right) \\\\ \\mathbf{x}_{t+\\Delta t} &= \\mathbf{x}_t + \\Delta t\\,\\mathbf{v}_{t+\\Delta t} \\end{aligned}',
          symbols: [
            { tex: 'm', meaning: '質点の質量', unit: '\\mathrm{kg}' },
            { tex: '\\mathbf{F}', meaning: 'ばね・減衰・空気抵抗・風の力の合計', unit: '\\mathrm{N}' },
            { tex: '\\mathbf{g}', meaning: '重力加速度', unit: '\\mathrm{m/s^2}' },
            { tex: '\\Delta t', meaning: '時間刻み（速度を先に更新し、新しい速度で位置を更新する）', unit: '\\mathrm{s}' },
          ],
        },
        {
          caption: 'エネルギー（バネ 1 本・前進オイラー法での増え方）',
          tex: 'E = \\tfrac{1}{2}\\,m\\,v^2 + \\tfrac{1}{2}\\,k\\,x^2, \\qquad E_{n+1} = \\left( 1 + \\frac{k\\,\\Delta t^2}{m} \\right) E_n',
          symbols: [
            { tex: 'E', meaning: '運動エネルギーと弾性エネルギーの和', unit: '\\mathrm{J}' },
            { tex: 'v', meaning: '速度', unit: '\\mathrm{m/s}' },
          ],
        },
      ],
      snippets: ['massSpring-massSpringStepExplicit', 'massSpring-massSpringStep'],
      Sim: Step3,
    },
    {
      id: 'damping',
      title: '減衰',
      text: '現実のバネは、空気抵抗や摩擦で少しずつ動きが小さくなる。速度に比例して逆向きに働く力 −k_d·v を足すと、振動の大きさは e^(−γt) のように小さくなる。k_d が大きすぎる（2√(mk) 以上）と、振動せずにゆっくり元の位置へ戻る。',
      formulas: [
        {
          caption: '減衰のある単振動',
          tex: 'm\\,a = -k\\,x - k_d\\,v \\;\\Longrightarrow\\; x(t) = A\\,e^{-\\gamma t}\\cos(\\omega_d t - \\varphi), \\quad \\gamma = \\frac{k_d}{2m}, \\quad \\omega_d = \\sqrt{\\frac{k}{m} - \\gamma^2}',
          symbols: [
            { tex: 'k_d', meaning: '減衰係数', unit: '\\mathrm{N\\,s/m}' },
            { tex: '\\gamma', meaning: '振幅が小さくなる速さ', unit: '\\mathrm{1/s}' },
            { tex: '\\omega_d', meaning: '減衰があるときの角振動数', unit: '\\mathrm{rad/s}' },
            { tex: 'A,\\ \\varphi', meaning: '最初の振幅と位相（離した状態から決まる）', unit: '' },
          ],
        },
        {
          caption: '振動しない条件（臨界減衰）',
          tex: 'k_d \\ge 2\\sqrt{m\\,k}',
        },
        {
          caption: 'バネの力に減衰を足した形（網のバネはこれ）',
          tex: '\\begin{aligned} \\mathbf{F}_1 &= \\left[ k\\,(L - L_0) + k_d\\,\\dot{L} \\right]\\mathbf{n}, \\qquad \\mathbf{F}_2 = -\\mathbf{F}_1 \\\\ \\mathbf{n} &= \\frac{\\mathbf{x}_2 - \\mathbf{x}_1}{L}, \\quad L = \\lVert \\mathbf{x}_2 - \\mathbf{x}_1 \\rVert, \\quad \\dot{L} = (\\mathbf{v}_2 - \\mathbf{v}_1)\\cdot\\mathbf{n} \\end{aligned}',
          symbols: [
            { tex: '\\mathbf{F}_1,\\ \\mathbf{F}_2', meaning: 'ばねが両端の質点 1・2 に与える力', unit: '\\mathrm{N}' },
            { tex: '\\dot{L}', meaning: '長さの変化の速さ（相対速度のばねの向きの成分）', unit: '\\mathrm{m/s}' },
            { tex: '\\mathbf{n}', meaning: '質点 1 から 2 へ向かう単位ベクトル', unit: '' },
          ],
        },
      ],
      snippets: ['massSpring-springForce'],
      Sim: Step4,
    },
    {
      id: 'stability',
      title: '安定の条件',
      text: '半陰的オイラー法でも、Δt を大きくしすぎると振動がどんどん大きくなって計算が壊れる。1 ステップで進める時間 Δt が、バネの振動の速さ ω に比べて長すぎる（ωΔt が 2 を超える）と起こり、条件は Δt < 2√(m/k)。硬いバネ（k が大きい）や軽いおもり（m が小さい）ほど、小さな Δt が必要になる。',
      formulas: [
        {
          caption: '安定の条件（質点 1 個とバネ 1 本）',
          tex: '\\Delta t < \\frac{2}{\\omega} = 2\\sqrt{\\frac{m}{k}}, \\qquad \\omega = \\sqrt{\\frac{k}{m}}',
          symbols: [
            { tex: '\\omega', meaning: '固有角振動数（網では、いちばん速い振動の ω_max を使う）', unit: '\\mathrm{rad/s}' },
            { tex: 'm', meaning: '質量', unit: '\\mathrm{kg}' },
            { tex: 'k', meaning: 'ばね定数', unit: '\\mathrm{N/m}' },
          ],
        },
      ],
      snippets: ['massSpring-criticalDt'],
      Sim: Step5,
    },
    {
      id: 'chain',
      title: '鎖',
      text: 'おもりを 1 個から 2 個、3 個とバネでつないで吊るすと、鎖になる。1 つのおもりが受ける力は、つながっている全部のバネの力と重力を、ベクトルとして足したもの。おもりごとにこれを求めて、前の段階と同じ更新で進める。',
      formulas: [
        {
          tex: 'm\\,\\mathbf{a}_i = m\\,\\mathbf{g} + \\sum_{j \\in N(i)} k\\,(L_{ij} - L_0)\\,\\mathbf{n}_{ij}',
          symbols: [
            { tex: 'i,\\ j', meaning: 'おもりの番号', unit: '' },
            { tex: 'N(i)', meaning: 'おもり i とバネでつながっているおもりの番号の集まり', unit: '' },
            { tex: 'L_{ij}', meaning: 'おもり i・j の距離', unit: '\\mathrm{m}' },
            { tex: '\\mathbf{n}_{ij}', meaning: 'おもり i から j へ向かう長さ 1 のベクトル', unit: '' },
          ],
        },
      ],
      snippets: ['massSpring-computeForces'],
      Sim: Step6,
    },
    {
      id: 'net',
      title: '網',
      text: '鎖を縦にも横にも並べ、隣どうしをバネでつなぐと網（布）になる。縦横のバネだけだと、四角が平行四辺形につぶれてずれに弱いので、斜めのバネを足すと形が保たれる。全体のシミュレーションの網は、これを 14 × 10 個に増やしたもの。',
      formulas: [
        {
          caption: 'バネの自然長',
          tex: 'L_0 = \\begin{cases} a & (\\text{縦・横のバネ}) \\\\ \\sqrt{2}\\,a & (\\text{斜めのバネ}) \\end{cases}',
          symbols: [{ tex: 'a', meaning: '質点の間隔', unit: '\\mathrm{m}' }],
        },
      ],
      snippets: ['massSpring-massSpringStep'],
      Sim: Step7,
    },
    {
      id: 'wind',
      title: '風の力',
      text: '風が板に当たると、風と同じ向きに押す抗力 D と、風に垂直な向きに働く揚力 L が生まれる。どちらも風の速さの 2 乗に比例し、風が 2 倍になると力は 4 倍になる。布の網は、辺 1 本ずつをこの板とみなして風の力を求める。',
      formulas: [
        {
          tex: '\\mathbf{D} = \\tfrac{1}{2}\\,C_D\\,\\rho\\,S\\,\\lVert \\mathbf{U} \\rVert\\,\\mathbf{U}, \\qquad \\mathbf{L} = \\tfrac{1}{2}\\,C_L\\,\\rho\\,S\\,(\\mathbf{U} \\times \\mathbf{n}) \\times \\mathbf{U}',
          symbols: [
            { tex: '\\mathbf{U}', meaning: '板に対する空気の速度（風の速度 − 板の速度）', unit: '\\mathrm{m/s}' },
            { tex: '\\mathbf{n}', meaning: '板の単位法線（風下を向く側）', unit: '' },
            { tex: 'S', meaning: '板の面積（辺の長さ × 奥行き）', unit: '\\mathrm{m^2}' },
            { tex: '\\rho', meaning: '空気の密度', unit: '\\mathrm{kg/m^3}' },
            { tex: 'C_D', meaning: '抗力係数', unit: '' },
            { tex: 'C_L', meaning: '揚力係数（この式は板が風と平行なとき最大になる簡単なモデル。網の初期値は 0）', unit: '' },
          ],
        },
      ],
      snippets: ['massSpring-aeroForce', 'massSpring-addWindForces'],
      Sim: Step8,
    },
    {
      id: 'position-based',
      title: '位置ベース法',
      text: '力から加速度を求めて進める代わりに、「この 2 点の距離は d に保つ」という条件（拘束）を満たすよう、位置を直接直す方法。速度だけで進めた予測位置 p を、質量の逆数 w の割合で動かして距離を d に近づけ、動かした分から速度を決め直す。1 回の補正では d にぴったりならないので何回か繰り返し（反復）、回数が増えるほど網の伸びが減る。',
      formulas: [
        {
          caption: '距離の拘束と、位置の補正',
          tex: '\\begin{aligned} C(\\mathbf{p}_1, \\mathbf{p}_2) &= \\lVert \\mathbf{p}_1 - \\mathbf{p}_2 \\rVert^2 - d^2 = 0 \\\\ \\Delta\\mathbf{p}_i &= \\lambda\\, w_i\\, \\nabla_{\\mathbf{p}_i} C, \\qquad \\lambda = -\\frac{C}{\\sum_j w_j\\, \\lVert \\nabla_{\\mathbf{p}_j} C \\rVert^2} \\end{aligned}',
          symbols: [
            { tex: '\\mathbf{p}_i', meaning: '質点 i の予測位置（速度で進めただけの位置）', unit: '\\mathrm{m}' },
            { tex: 'd', meaning: '2 点を保つ距離（自然長）', unit: '\\mathrm{m}' },
            { tex: 'w_i', meaning: '質量の逆数（固定した質点は 0）', unit: '\\mathrm{1/kg}' },
            { tex: '\\Delta\\mathbf{p}_i', meaning: '質点 i の位置の補正', unit: '\\mathrm{m}' },
            { tex: '\\lambda', meaning: '補正の大きさを決める係数', unit: '\\mathrm{kg}' },
          ],
        },
        {
          caption: '補正のあとの速度',
          tex: '\\mathbf{v} = \\frac{\\mathbf{p} - \\mathbf{x}}{\\Delta t}, \\qquad \\mathbf{x} \\leftarrow \\mathbf{p}',
          symbols: [
            { tex: '\\mathbf{x}', meaning: 'このステップの最初の位置', unit: '\\mathrm{m}' },
            { tex: '\\mathbf{p}', meaning: '補正を終えた位置', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['pbd-projectDistance', 'pbd-solveConstraints', 'pbd-pbdStep'],
      Sim: Step9,
    },
  ],
  combination: {
    text: '網の全部の質点について、1 ステップごとに次の順で計算する。位置ベース法は、力を使う 1〜4 の代わりに 9 を使う。',
    flow: [
      { steps: [1, 6, 7], text: '1 本のバネの力（フックの法則）を、鎖や網の全部のバネについて求め、質点ごとに足し合わせる' },
      { steps: [4, 8], text: '減衰の力と、風の力（辺を板とみなした抗力・揚力）を足す' },
      { steps: [2, 3], text: '運動方程式で加速度を求め、半陰的オイラー法で、速度を先に・新しい速度で位置を進める' },
      { steps: [5], text: 'Δt を、安定の限界 2√(m/k)（網ではいちばん速い振動で決まる）より小さく選ぶ' },
      { steps: [9], text: '位置ベース法では、網の全部の辺の距離の補正を何回か繰り返して、位置を直接直す' },
    ],
  },
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
}
