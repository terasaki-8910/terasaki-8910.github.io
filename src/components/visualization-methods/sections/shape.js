import { lazy } from 'react'

const ShapeSim = lazy(() => import('../sims/shapeSim.jsx'))
const ShapeStep1 = lazy(() => import('../sims/shapeStep1.jsx'))
const ShapeStep2 = lazy(() => import('../sims/shapeStep2.jsx'))
const ShapeStep3 = lazy(() => import('../sims/shapeStep3.jsx'))
const ShapeStep4 = lazy(() => import('../sims/shapeStep4.jsx'))
const ShapeStep5 = lazy(() => import('../sims/shapeStep5.jsx'))
const ShapeStep6 = lazy(() => import('../sims/shapeStep6.jsx'))
const ShapeStep7 = lazy(() => import('../sims/shapeStep7.jsx'))
const ShapeStep8 = lazy(() => import('../sims/shapeStep8.jsx'))

export default {
  id: 'shape',
  tabLabel: '形状',
  title: '曲線と曲面',
  intro: '点をいくつか置くと、それをなめらかにつなぐ曲線が決まる。点（制御点）をつかんで動かすと、曲線の決め方による違いが見える。',
  overview: {
    Sim: ShapeSim,
    caption: '制御点と曲線上の点をつかむと、曲線の作り方による形・接線・法線・曲率の変化を見比べられます。',
  },
  steps: [
    {
      id: 'parametric',
      title: '媒介変数で表す曲線と、式で囲む曲線',
      text: '媒介変数 t を少しずつ変えると曲線上を歩けるため、等しい t の間隔で点を並べられます。一方の F(x, y) = 0 は曲線を点の集合として表し、F の符号から内側と外側を一度に判定できます。楕円では P(t) と自由な点 Q をつかみ、双曲線では cosh²t − sinh²t = 1 によって点が式を満たすことも確かめてください。',
      formulas: [
        {
          caption: '楕円の媒介変数表示',
          tex: 'x = a\\cos t,\\quad y = b\\sin t',
          symbols: [
            { tex: 't', meaning: '媒介変数', unit: '' },
            { tex: 'a', meaning: '横方向の半径', unit: '' },
            { tex: 'b', meaning: '縦方向の半径', unit: '' },
          ],
        },
        {
          caption: '楕円の陰関数表示',
          tex: 'F(x,y) = \\frac{x^2}{a^2} + \\frac{y^2}{b^2} - 1 = 0',
          symbols: [{ tex: 'F', meaning: '曲線上で 0 になる関数', unit: '' }],
        },
        {
          caption: '双曲線の媒介変数表示',
          tex: 'x = a\\cosh t,\\quad y = b\\sinh t,\\quad \\cosh t = \\frac{e^t+e^{-t}}{2},\\quad \\sinh t = \\frac{e^t-e^{-t}}{2}',
          symbols: [{ tex: 't', meaning: '右枝をたどる媒介変数', unit: '' }],
        },
        {
          caption: '双曲線の陰関数表示',
          tex: 'F(x,y) = \\frac{x^2}{a^2} - \\frac{y^2}{b^2} - 1 = 0',
          symbols: [{ tex: 'F', meaning: '曲線上で 0 になる関数', unit: '' }],
        },
      ],
      snippets: ['curve-ellipsePoint', 'curve-ellipseImplicit', 'curve-hyperbolaPoint', 'curve-hyperbolaImplicit'],
      Sim: ShapeStep1,
    },
    {
      id: 'lerp',
      title: '2 点を結ぶ（線形補間）',
      text: 'P(t) は線分を長さの比 t : (1 − t) に分ける点で、座標ごとの掛け算と足し算だけで求められます。t = 0 では P0、t = 1 では P1 と一致します。端点や P(t) をつかみ、比の表示と座標が一緒に変わる様子を見てください。',
      formulas: [
        {
          caption: '線形補間',
          tex: 'P(t) = (1-t)P_0 + tP_1\\quad (0 \\le t \\le 1)',
          symbols: [
            { tex: 'P_0, P_1', meaning: '線分の端点', unit: '' },
            { tex: 't', meaning: 'P0 から P1 へ進む割合', unit: '' },
          ],
        },
      ],
      snippets: ['curve-lerpPoint'],
      Sim: ShapeStep2,
    },
    {
      id: 'de-casteljau',
      title: '線形補間を重ねる（ド・カステリョのアルゴリズム）',
      text: '隣り合う点を同じ t で分け、その新しい点どうしをまた同じ比で分ける操作を、1 点になるまで繰り返します。最後に残る点を t = 0 から 1 まで動かした軌跡がベジエ曲線です。制御点や曲線上の点をつかみ、各段の線分が連動して縮む様子を見てください。',
      formulas: [
        {
          caption: '各段の線形補間',
          tex: 'P_i^{(k)}(t) = (1-t)P_i^{(k-1)}(t) + tP_{i+1}^{(k-1)}(t),\\quad P(t)=P_0^{(n)}(t)',
          symbols: [
            { tex: 'k', meaning: '補間の段', unit: '' },
            { tex: 'i', meaning: '段の中の点番号', unit: '' },
          ],
        },
        {
          caption: '2 次ベジエ曲線の展開',
          tex: 'P(t) = (1-t)^2P_0 + 2t(1-t)P_1 + t^2P_2',
          symbols: [{ tex: 't', meaning: '共通に使う内分比', unit: '' }],
        },
      ],
      snippets: ['curve-deCasteljau'],
      Sim: ShapeStep3,
    },
    {
      id: 'bernstein',
      title: '重みの足し合わせ（バーンスタイン基底）',
      text: 'ド・カステリョの計算を展開すると、制御点にバーンスタイン基底の重みを掛けた足し合わせになります。重みは二項定理の各項なので 0 以上で、どの t でも和が 1 です。そのため曲線は凸包の内側に残り、両端では端の制御点を通ることを、制御点とグラフの縦線をつかんで確かめてください。',
      formulas: [
        {
          caption: 'バーンスタイン基底',
          tex: 'B_i^n(t) = {n \\choose i}t^i(1-t)^{n-i}',
          symbols: [
            { tex: 'n', meaning: '曲線の次数', unit: '' },
            { tex: 'i', meaning: '制御点の番号', unit: '' },
            { tex: 't', meaning: '曲線上の位置', unit: '' },
          ],
        },
        {
          caption: '制御点の重み付き和',
          tex: 'P(t) = \\sum_{i=0}^{n} B_i^n(t)P_i',
          symbols: [{ tex: 'P_i', meaning: 'i 番目の制御点', unit: '' }],
        },
        {
          caption: '重みの総和',
          tex: '\\sum_{i=0}^{n} B_i^n(t) = ((1-t)+t)^n = 1',
          symbols: [{ tex: 'B_i^n', meaning: '各制御点に掛かる重み', unit: '' }],
        },
      ],
      snippets: ['curve-binomial', 'curve-bernstein', 'curve-bezierPoint'],
      Sim: ShapeStep4,
    },
    {
      id: 'b-spline',
      title: '近くの点だけが効く曲線（B スプライン）',
      text: '各制御点の重みを Cox–de Boor の式で隣の区間から順に作り、重み付きで足すと B スプラインになります。3 次では 1 点の重みが 4 区間だけで 0 でなく、区分どうしは 2 階微分まで連続して滑らかにつながります。制御点をつかみ、太く示した曲線の一部だけが変わることと、比較用のベジエ曲線は全体が動くことを見てください。曲線は端の制御点を通りません。',
      formulas: [
        {
          caption: '0 次の基底',
          tex: 'N_i^0(t)=\\begin{cases}1 & t_i \\le t < t_{i+1}\\\\0 & \\text{otherwise}\\end{cases}',
          symbols: [{ tex: 't_i', meaning: '節点', unit: '' }],
        },
        {
          caption: 'Cox–de Boor の再帰式',
          tex: 'N_i^n(t)=\\frac{t-t_i}{t_{i+n}-t_i}N_i^{n-1}(t)+\\frac{t_{i+n+1}-t}{t_{i+n+1}-t_{i+1}}N_{i+1}^{n-1}(t)',
          symbols: [{ tex: 'n', meaning: '基底の次数', unit: '' }],
        },
        {
          caption: '制御点の重み付き和',
          tex: 'P(t)=\\sum_i N_i^n(t)P_i,\\qquad N_i^n(t)=0\\quad (t\\notin[t_i,t_{i+n+1}))',
          symbols: [{ tex: 'N_i^n', meaning: 'i 番目の制御点の局所的な重み', unit: '' }],
        },
      ],
      snippets: ['curve-uniformKnots', 'curve-bsplineBasis', 'curve-bsplinePoint'],
      Sim: ShapeStep5,
    },
    {
      id: 'subdivision',
      title: 'かどを切り落とす（細分割）',
      text: '各辺の 1/4 と 3/4 の位置に新しい点を置いて古い角を捨てると、折れ線の角が一段ずつ丸くなります。繰り返した極限は一様 2 次 B スプラインになり、曲面でも同じ考えを使う Catmull–Clark 細分割曲面は双 3 次 B スプライン曲面になります。制御点をつかみ、再生または回数スライダーで点の数が増え、極限までの最大距離が小さくなる様子を見てください。',
      formulas: [
        {
          caption: '各辺に置く 2 点',
          tex: 'Q_i=\\frac{3}{4}P_i+\\frac{1}{4}P_{i+1},\\qquad R_i=\\frac{1}{4}P_i+\\frac{3}{4}P_{i+1}',
          symbols: [
            { tex: 'Q_i', meaning: '辺の 1/4 の点', unit: '' },
            { tex: 'R_i', meaning: '辺の 3/4 の点', unit: '' },
          ],
        },
      ],
      snippets: ['curve-chaikinStep', 'curve-chaikin'],
      Sim: ShapeStep6,
    },
    {
      id: 'curvature',
      title: '曲がり方を測る（接線・法線・曲率）',
      text: '曲線の進む向きを長さ 1 にしたものが接線 T、その直角で曲がる側が法線 N で、接触円の半径 R の逆数が曲率 κ です。直線では κ = 0 となり、急な曲がりほど値が大きくなります。制御点や曲線上の点をつかみ、矢印と接触円、下の曲率グラフが同時に変わる様子を見てください。',
      formulas: [
        {
          caption: '弧長で測る接線・法線・曲率',
          tex: 'T=\\frac{dC}{ds},\\qquad \\kappa N=\\frac{d^2C}{ds^2},\\qquad R=\\frac{1}{\\kappa}',
          symbols: [
            { tex: 's', meaning: '曲線に沿った長さ', unit: '' },
            { tex: 'R', meaning: '接触円の半径', unit: '' },
          ],
        },
        {
          caption: '一般の媒介変数による曲率',
          tex: '\\kappa=\\frac{x\'y\'\'-y\'x\'\'}{(x\'^2+y\'^2)^{3/2}}',
          symbols: [{ tex: "x',y'", meaning: '媒介変数による 1 階微分', unit: '' }],
        },
        {
          caption: '空間曲線の Frenet–Serret 公式',
          tex: '\\frac{dT}{ds}=\\kappa N,\\quad \\frac{dN}{ds}=-\\kappa T-\\tau B,\\quad \\frac{dB}{ds}=\\tau N,\\quad B=T\\times N',
          symbols: [
            { tex: 'B', meaning: '従法線', unit: '' },
            { tex: '\\tau', meaning: 'ねじれ率', unit: '' },
          ],
        },
      ],
      snippets: ['curve-bezierDerivative', 'curve-curvature2D', 'curve-frame2D'],
      Sim: ShapeStep7,
    },
    {
      id: 'surface',
      title: '曲線を 2 方向に掛ける（曲面と法線）',
      text: 'u を固定すると v の曲線、v を固定すると u の曲線になり、2 方向の重みを掛けて 16 点を足すと曲面になります。2 本の接線の外積は曲面に垂直な法線で、次のタブ「反射と影」で使う明るさもこの向きから計算できます。制御点を上下にドラッグして高さを変え、空いた場所で視点を回し、u・v スライダーで 2 本の曲線と 3 本の矢印を動かしてください。',
      formulas: [
        {
          caption: '双 3 次ベジエ曲面',
          tex: 'S(u,v)=\\sum_{i=0}^{3}\\sum_{j=0}^{3}B_i^3(u)B_j^3(v)P_{ij},\\qquad n=S_u\\times S_v',
          symbols: [
            { tex: 'u,v', meaning: '曲面上の 2 方向の媒介変数', unit: '' },
            { tex: 'n', meaning: '接線 2 本の外積で得る法線', unit: '' },
          ],
        },
        {
          caption: '曲面の曲率',
          tex: 'K=\\kappa_1\\kappa_2,\\qquad H=\\frac{\\kappa_1+\\kappa_2}{2}',
          symbols: [
            { tex: '\\kappa_1,\\kappa_2', meaning: '主曲率', unit: '' },
            { tex: 'K', meaning: 'ガウス曲率', unit: '' },
            { tex: 'H', meaning: '平均曲率', unit: '' },
          ],
        },
      ],
      snippets: ['curve-bezierPatch', 'curve-cross'],
      Sim: ShapeStep8,
    },
  ],
  combination: {
    text: '全体の 3 つの曲線は、どれも制御点に重みをかけて足したもの。重みの決め方が違う。',
    flow: [
      { steps: [2, 3], text: '線形補間を重ねるとベジエ曲線' },
      { steps: [4], text: '重みの和で書くと、凸包の中に収まり端を通ると分かる' },
      { steps: [5], text: '重みを近くの区間だけにすると B スプライン' },
      { steps: [6], text: 'かどを切り続けると 2 次の B スプライン' },
      { steps: [7], text: 'できた曲線の曲がり方を接触円で測る' },
      { steps: [1, 8], text: '曲線は媒介変数の式。2 方向に掛けると曲面になり、外積で法線が求まる' },
    ],
  },
  sources: [
    { text: 'P. Bézier, Numerical Control: Mathematics and Applications, Wiley, 1972' },
    { text: 'G. Farin, Curves and Surfaces for CAGD: A Practical Guide, 5th ed., Morgan Kaufmann, 2002' },
    { text: 'C. de Boor, On calculating with B-splines, J. Approximation Theory 6, 50–62, 1972' },
    { text: 'M. G. Cox, The numerical evaluation of B-splines, IMA J. Applied Mathematics 10, 134–149, 1972' },
    { text: 'G. M. Chaikin, An algorithm for high-speed curve generation, Computer Graphics and Image Processing 3(4), 346–349, 1974' },
    { text: 'E. Catmull, J. Clark, Recursively generated B-spline surfaces on arbitrary topological meshes, Computer-Aided Design 10(6), 350–355, 1978' },
    { text: 'M. P. do Carmo, Differential Geometry of Curves and Surfaces, Prentice-Hall, 1976' },
  ],
}
