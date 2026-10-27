import { lazy } from 'react'

const FlowSim = lazy(() => import('../sims/flowSim.jsx'))
const FlowStep1 = lazy(() => import('../sims/flowStep1.jsx'))
const FlowStep2 = lazy(() => import('../sims/flowStep2.jsx'))
const FlowStep3 = lazy(() => import('../sims/flowStep3.jsx'))
const FlowStep4 = lazy(() => import('../sims/flowStep4.jsx'))
const FlowStep5 = lazy(() => import('../sims/flowStep5.jsx'))
const FlowStep6 = lazy(() => import('../sims/flowStep6.jsx'))

export default {
  id: 'flow',
  tabLabel: '流れ',
  title: '流れの可視化',
  intro: '空気や水の流れのように目に見えない速度の場を、矢印・線・粒子・模様で描く。流れはドラッグでかき混ぜられる。',
  overview: {
    Sim: FlowSim,
    caption: '流れをドラッグでかき混ぜながら、同じ速度の場を矢印・流線・粒子・LIC のどれで描くかを切り替え、特異点の印も重ねられます。',
  },
  steps: [
    {
      id: 'glyph',
      title: '矢印で描く',
      text: '格子の点ごとに速度 (u, v) を求め、その点から速度の向きに、長さ k√(u² + v²) の矢印を伸ばします。矢印の先は点の座標に k u と k v を足した位置で、高校の数学のベクトルの足し算だけで決まります。渦の中心の丸をつかんで動かし、格子を細かくして矢印どうしが重なる様子を見てください。「長さをそろえる」と速さは色で読み取れ、重なりも減りますが、「境界に合わせた格子」のように点が片側に集まると、長さをそろえても重なります。',
      formulas: [
        {
          caption: '矢印の描き方',
          tex: '\\boldsymbol{x}\\ \\to\\ \\boldsymbol{x}+k\\,\\boldsymbol{v}(\\boldsymbol{x})',
          symbols: [
            { tex: '\\boldsymbol{v}=(u,v)', meaning: '点 x での速度（x 成分と y 成分）', unit: '' },
            { tex: 'k', meaning: '長さの倍率', unit: '' },
          ],
        },
        {
          caption: '速さ（長さをそろえたときの色）',
          tex: 's(\\boldsymbol{x})=|\\boldsymbol{v}(\\boldsymbol{x})|=\\sqrt{u^2+v^2}',
          symbols: [
            { tex: 's', meaning: '速さ', unit: '' },
          ],
        },
        {
          caption: '渦の回る速さ（流れの例）',
          tex: 'v_\\theta(r)=\\frac{\\Gamma}{2\\pi r}\\left(1-e^{-r^2/a^2}\\right)',
          symbols: [
            { tex: '\\Gamma', meaning: '渦の強さ（循環）', unit: '' },
            { tex: 'r', meaning: '渦の中心からの距離', unit: '' },
            { tex: 'a', meaning: '渦の芯の大きさ', unit: '' },
          ],
        },
        {
          caption: '全体の流れ',
          tex: '\\boldsymbol{v}=\\boldsymbol{v}_{\\text{渦}}+\\boldsymbol{U}',
          symbols: [
            { tex: '\\boldsymbol{U}', meaning: '一様な流れ', unit: '' },
          ],
        },
      ],
      snippets: ['flow-vortexField'],
      Sim: FlowStep1,
    },
    {
      id: 'streamline',
      title: '流線をたどる（数値積分）',
      text: '流線は、どの点でも接線が速度の向きに一致する曲線です。出発点から速度の向きに h だけ進む、という 1 歩をくり返せば描けますが（オイラー法）、曲がった流れでは進むたびに少しずつ外へずれます。1 歩の前に途中の点で向きを 3 回確かめ、4 つの向きに重みをつけて平均すると（ルンゲ・クッタ法）、同じ h でもほとんどずれません。出発点の丸をつかみ、h を大きくして、1 周したあとの半径の違いを見てください。',
      formulas: [
        {
          caption: '流線の定義',
          tex: '\\frac{d\\boldsymbol{x}}{ds}=\\boldsymbol{v}(\\boldsymbol{x})',
          symbols: [
            { tex: 's', meaning: '曲線に沿って進むパラメータ', unit: '' },
            { tex: '\\boldsymbol{v}', meaning: '速度', unit: '' },
          ],
        },
        {
          caption: 'オイラー法',
          tex: '\\boldsymbol{x}_{k+1}=\\boldsymbol{x}_k+h\\,\\boldsymbol{v}(\\boldsymbol{x}_k)',
          symbols: [
            { tex: 'h', meaning: '1 歩の大きさ', unit: '' },
            { tex: '\\boldsymbol{x}_k', meaning: 'k 歩目の点', unit: '' },
          ],
        },
        {
          caption: 'ルンゲ・クッタ法（RK4）',
          tex: '\\begin{aligned}\\boldsymbol{k}_1&=\\boldsymbol{v}(\\boldsymbol{x}_k)\\\\ \\boldsymbol{k}_2&=\\boldsymbol{v}\\left(\\boldsymbol{x}_k+\\tfrac{h}{2}\\boldsymbol{k}_1\\right)\\\\ \\boldsymbol{k}_3&=\\boldsymbol{v}\\left(\\boldsymbol{x}_k+\\tfrac{h}{2}\\boldsymbol{k}_2\\right)\\\\ \\boldsymbol{k}_4&=\\boldsymbol{v}(\\boldsymbol{x}_k+h\\,\\boldsymbol{k}_3)\\\\ \\boldsymbol{x}_{k+1}&=\\boldsymbol{x}_k+\\frac{h}{6}\\left(\\boldsymbol{k}_1+2\\boldsymbol{k}_2+2\\boldsymbol{k}_3+\\boldsymbol{k}_4\\right)\\end{aligned}',
          symbols: [
            { tex: '\\boldsymbol{k}_1,\\ \\boldsymbol{k}_2,\\ \\boldsymbol{k}_3,\\ \\boldsymbol{k}_4', meaning: '1 歩のなかで確かめる 4 つの向き', unit: '' },
          ],
        },
      ],
      snippets: ['flow-eulerStep2', 'flow-rk4Step2', 'flow-streamline'],
      Sim: FlowStep2,
    },
    {
      id: 'seeding',
      title: '出発点の置き方',
      text: '流線の形は流れが決めますが、どこに何本引くかは出発点の置き方で決まります。格子に均等に置くと、遅い所にも同じだけ線が引かれ、速さに比例する確率で選ぶと、速い所の線が増えます。「間をあける」は、すでにある線から一定の距離より近い出発点を捨て、線も近づいたところで止めるので、混み合わずに読めます。渦の中心の丸をつかんで動かし、置き方を切り替えて線の混み具合を比べてください。',
      formulas: [
        {
          caption: '速さに比例する出発点',
          tex: 'p(\\boldsymbol{x})=\\frac{|\\boldsymbol{v}(\\boldsymbol{x})|}{\\displaystyle\\int|\\boldsymbol{v}|\\,dA}',
          symbols: [
            { tex: 'p', meaning: '点 x に出発点を置く確率の密度', unit: '' },
            { tex: 'dA', meaning: '面積の要素', unit: '' },
          ],
        },
        {
          caption: '間をあける条件',
          tex: '\\min_{\\boldsymbol{y}\\,\\in\\,\\text{既存の線}}|\\boldsymbol{x}-\\boldsymbol{y}|\\ \\ge\\ d_{\\mathrm{sep}}',
          symbols: [
            { tex: 'd_{\\mathrm{sep}}', meaning: '線どうしの間隔（線は d_sep / 2 より近づくと止める）', unit: '' },
          ],
        },
      ],
      snippets: ['flow-seedsUniform', 'flow-seedsByMagnitude', 'flow-evenlySpacedStreamlines'],
      Sim: FlowStep3,
    },
    {
      id: 'pathline',
      title: '流線と粒子の軌跡（時間で変わる流れ）',
      text: '流れが時間で変わらなければ、粒子は流線に沿って進み、流線・粒子の通った道・染料の線は同じ曲線に重なります。流れが時間で変わると、ある時刻の向きをたどった流線、粒子が実際に通った道（流跡線）、同じ点から出し続けた染料の線（流脈線）は別々の線になります。2 つの渦が揺れ動く流れで、揺れの大きさ ε を 0 から大きくし、出発点の丸を動かして、3 本の線がずれていく様子を見てください。',
      formulas: [
        {
          caption: '流線（時刻 t* で流れを止めてたどる）',
          tex: '\\frac{d\\boldsymbol{x}}{ds}=\\boldsymbol{v}(\\boldsymbol{x},\\,t_*)',
          symbols: [
            { tex: 't_*', meaning: '流れを止める時刻', unit: '' },
          ],
        },
        {
          caption: '流跡線（粒子が通った道）',
          tex: '\\frac{d\\boldsymbol{x}}{dt}=\\boldsymbol{v}(\\boldsymbol{x},\\,t),\\qquad \\boldsymbol{x}(t_0)=\\boldsymbol{x}_0',
          symbols: [
            { tex: 't_0', meaning: '粒子を放した時刻', unit: '' },
            { tex: '\\boldsymbol{x}_0', meaning: '放した点（出発点）', unit: '' },
          ],
        },
        {
          caption: '流脈線（出し続けた染料）',
          tex: '\\bigl\\{\\,\\boldsymbol{x}(t;\\tau)\\ \\big|\\ t_0\\le\\tau\\le t\\,\\bigr\\}',
          symbols: [
            { tex: '\\boldsymbol{x}(t;\\tau)', meaning: '時刻 τ に放した粒子の、時刻 t での位置', unit: '' },
          ],
        },
        {
          caption: 'ダブルジャイヤー（揺れる 2 つの渦）',
          tex: '\\psi=A\\sin\\bigl(\\pi f(x,t)\\bigr)\\sin(\\pi y)',
          symbols: [
            { tex: '\\psi', meaning: '流れの関数（速度はその微分）', unit: '' },
            { tex: 'A', meaning: '速さの大きさを決める定数', unit: '' },
          ],
        },
        {
          caption: '渦の揺れ',
          tex: 'f(x,t)=\\varepsilon\\sin(\\omega t)\\,x^2+\\bigl(1-2\\varepsilon\\sin(\\omega t)\\bigr)x',
          symbols: [
            { tex: '\\varepsilon', meaning: '渦の揺れの大きさ', unit: '' },
            { tex: '\\omega', meaning: '揺れの角速度（周期 10）', unit: '' },
          ],
        },
        {
          caption: '速度',
          tex: 'u=-\\frac{\\partial\\psi}{\\partial y},\\qquad v=\\frac{\\partial\\psi}{\\partial x}',
          symbols: [],
        },
      ],
      snippets: ['flow-doubleGyre', 'flow-pathline', 'flow-streakline'],
      Sim: FlowStep4,
    },
    {
      id: 'lic',
      title: '模様で描く（LIC）',
      text: '各画素から流線を前後に L 歩たどり、通った所のノイズの値を平均します。もとのノイズは画素ごとにでたらめですが、同じ流線を通る画素どうしは平均に同じ値をたくさん含むので、似た明るさになり、流れに沿った筋が現れます。切り替えでノイズ・LIC・スポットノイズ（流れの向きに伸ばした楕円をたくさん重ねる方法）を見比べ、L を大きくして筋が長くなる様子と、渦の中心をつかんで動かしたときの模様の変化を見てください。',
      formulas: [
        {
          caption: 'LIC（流線に沿ったノイズの平均）',
          tex: 'I(\\boldsymbol{x})=\\frac{1}{2L+1}\\sum_{k=-L}^{L}N\\bigl(\\sigma_{\\boldsymbol{x}}(kh)\\bigr)',
          symbols: [
            { tex: 'N', meaning: 'ノイズの値（画素ごとにでたらめ）', unit: '' },
            { tex: '\\sigma_{\\boldsymbol{x}}(kh)', meaning: 'x を通る流線を、x から k 歩（1 歩の長さ h）たどった点', unit: '' },
            { tex: 'L', meaning: '前後にたどる歩数', unit: '' },
          ],
        },
        {
          caption: 'スポットノイズ（楕円の重ね合わせ）',
          tex: 'I(\\boldsymbol{x})=\\sum_i a_i\\,\\max\\left(0,\\ 1-\\frac{p_i^2}{\\ell^2}-\\frac{q_i^2}{w^2}\\right)',
          symbols: [
            { tex: 'a_i', meaning: '楕円 i の強さ（でたらめな +1 か −1）', unit: '' },
            { tex: 'p_i,\\ q_i', meaning: '楕円の中心から見た、流れに沿う向きと直角な向きの座標', unit: '' },
            { tex: '\\ell,\\ w', meaning: '楕円の長さと幅の半分', unit: '' },
          ],
        },
      ],
      snippets: ['flow-lic', 'flow-spotNoise'],
      Sim: FlowStep5,
    },
    {
      id: 'critical-point',
      title: '流れの止まる点（特異点）の分類',
      text: '速度が 0 になる点のまわりでは、速度は点からのずれにほぼ比例して変わり、その比例の仕方を表す行列がヤコビ行列 J です。J の固有値が実数か複素数か、正か負かで、鞍点・湧き出し・吸い込み・渦心・らせんに分かれます。トレース tr J と行列式 det J の平面の点をつかんで動かし、放物線 det = tr²/4 をまたいだときの流線の形の変わり方を見てください。',
      formulas: [
        {
          caption: '特異点のまわりの流れ',
          tex: '\\boldsymbol{v}(\\boldsymbol{x})\\approx J\\,(\\boldsymbol{x}-\\boldsymbol{x}_c)',
          symbols: [
            { tex: '\\boldsymbol{x}_c', meaning: '特異点（速度が 0 の点）', unit: '' },
            { tex: 'J', meaning: 'ヤコビ行列（速度の変わり方）', unit: '' },
          ],
        },
        {
          caption: 'ヤコビ行列',
          tex: 'J=\\begin{pmatrix}\\partial u/\\partial x & \\partial u/\\partial y\\\\ \\partial v/\\partial x & \\partial v/\\partial y\\end{pmatrix}',
          symbols: [],
        },
        {
          caption: '固有値',
          tex: '\\lambda=\\frac{\\mathrm{tr}\\,J\\pm\\sqrt{(\\mathrm{tr}\\,J)^2-4\\det J}}{2}',
          symbols: [
            { tex: '\\mathrm{tr}\\,J', meaning: 'J の対角成分の和（トレース）', unit: '' },
            { tex: '\\det J', meaning: 'J の行列式', unit: '' },
          ],
        },
        {
          caption: '分類',
          tex: '\\begin{cases}\\det J<0 & \\text{鞍点}\\\\ \\det J>0,\\ (\\mathrm{tr}\\,J)^2\\ge 4\\det J & \\text{湧き出し（}\\mathrm{tr}\\,J>0\\text{）・吸い込み（}\\mathrm{tr}\\,J<0\\text{）}\\\\ (\\mathrm{tr}\\,J)^2<4\\det J & \\text{渦心（}\\mathrm{tr}\\,J=0\\text{）・らせん（}\\mathrm{tr}\\,J\\neq 0\\text{）}\\end{cases}',
          symbols: [],
        },
      ],
      snippets: ['flow-jacobian2', 'flow-classifyCriticalPoint', 'flow-findCriticalPoints'],
      Sim: FlowStep6,
    },
  ],
  combination: {
    text: '全体の 4 つの描き方は、どれも同じ速度の場を、違う形にして描いている。',
    flow: [
      { steps: [1], text: '点ごとの速度をそのまま矢印に' },
      { steps: [2, 3], text: '出発点を置き、速度の向きにたどると流線' },
      { steps: [4], text: '時間で変わる流れでは、粒子を動かして軌跡を残す' },
      { steps: [5], text: 'ノイズを流線に沿って平均すると LIC の模様' },
      { steps: [6], text: '速度が 0 の点を見つけ、まわりの流れ方で分類する' },
    ],
  },
  sources: [
    { text: 'B. Cabral, L. C. Leedom, Imaging vector fields using line integral convolution, SIGGRAPH \'93, 263–270, 1993' },
    { text: 'J. J. van Wijk, Spot noise: texture synthesis for data visualization, SIGGRAPH \'91, 309–318, 1991' },
    { text: 'G. Turk, D. Banks, Image-guided streamline placement, SIGGRAPH \'96, 453–460, 1996' },
    { text: 'B. Jobard, W. Lefer, Creating evenly-spaced streamlines of arbitrary density, Visualization in Scientific Computing \'97, 43–55, 1997' },
    { text: 'J. L. Helman, L. Hesselink, Representation and display of vector field topology in fluid flow data sets, IEEE Computer 22(8), 27–36, 1989' },
    { text: 'S. C. Shadden, F. Lekien, J. E. Marsden, Definition and properties of Lagrangian coherent structures from finite-time Lyapunov exponents in two-dimensional aperiodic flows, Physica D 212, 271–304, 2005' },
    { text: 'E. Hairer, S. P. Nørsett, G. Wanner, Solving Ordinary Differential Equations I, 2nd ed., Springer, 1993' },
    { text: 'J. Stam, Stable fluids, SIGGRAPH \'99, 121–128, 1999' },
  ],
}
