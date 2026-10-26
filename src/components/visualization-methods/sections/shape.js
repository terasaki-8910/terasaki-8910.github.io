import { lazy } from 'react'

const ShapeSim = lazy(() => import('../sims/shapeSim.jsx'))
const ShapeStep1 = lazy(() => import('../sims/shapeStep1.jsx'))
const ShapeStep2 = lazy(() => import('../sims/shapeStep2.jsx'))
const ShapeStep3 = lazy(() => import('../sims/shapeStep3.jsx'))
const ShapeStep4 = lazy(() => import('../sims/shapeStep4.jsx'))

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
  ],
  combination: {
    text: '前半では、点を動かす表現からベジエ曲線の重みまでを順に組み立てます。',
    flow: [
      { steps: [1, 2], text: '媒介変数で点を置き、まず 2 点間の線形補間として捉えます。' },
      { steps: [2, 3], text: '同じ線形補間を段ごとに繰り返し、曲線を作ります。' },
      { steps: [3, 4], text: '繰り返し計算を展開し、制御点の重みの足し合わせとして読み替えます。' },
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
