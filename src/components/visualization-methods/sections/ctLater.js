import { lazy } from 'react'

// CT のタブの段階 6〜10 と、組み合わせ(段階 1〜10)のデータ。sections/ct.js が、段階 1〜5 のあとにつなげて使う。
const CtStep6 = lazy(() => import('../sims/ctStep6.jsx'))
const CtStep7 = lazy(() => import('../sims/ctStep7.jsx'))
const CtStep8 = lazy(() => import('../sims/ctStep8.jsx'))
const CtStep9 = lazy(() => import('../sims/ctStep9.jsx'))
const CtStep10 = lazy(() => import('../sims/ctStep10.jsx'))

export const CT_LATER_STEPS = [
  {
    id: 'ramp-filter',
    title: '高い周波数を持ち上げる（ランプフィルタ）',
    text: '逆投影でぼけるのは、2 次元の周波数を極座標（距離と角度）で数えると、原点の近くに成分が密に集まりすぎるためです。そこで、極座標の面積の要素にあたる |w| を、各投影の周波数成分に掛けてから塗り戻します。高い周波数は雑音も持ち上げるので、窓で少し弱めます。模型の図の取っ手を回して向きを変え、窓と雑音も変えて、フィルタをかけた投影の両側にできる負の谷と、雑音の出方を見てください。',
    formulas: [
      {
        caption: 'ランプフィルタをかけた投影',
        tex: 'Q_\\theta(s)=\\int_{-\\infty}^{\\infty}P_\\theta(w)\\,|w|\\,e^{i2\\pi ws}\\,dw',
        symbols: [
          { tex: 'Q_\\theta(s)', meaning: 'フィルタをかけた投影', unit: '' },
          { tex: 'P_\\theta(w)', meaning: '向き θ の投影のフーリエ変換', unit: '' },
          { tex: 'w', meaning: '周波数', unit: '\\mathrm{length}^{-1}' },
          { tex: '|w|', meaning: 'ランプフィルタ（極座標の面積の要素）', unit: '\\mathrm{length}^{-1}' },
        ],
      },
      {
        caption: '空間のカーネル（検出器の間隔 τ）',
        tex: '\\begin{aligned} h(0) &= \\frac{1}{4\\tau^{2}} \\\\ h(n) &= \\begin{cases}0 & (n\\ \\text{が偶数})\\\\ -\\dfrac{1}{n^{2}\\pi^{2}\\tau^{2}} & (n\\ \\text{が奇数})\\end{cases} \\end{aligned}',
        symbols: [
          { tex: 'h(n)', meaning: 'ランプフィルタをたたみ込みで書いたときの係数', unit: '' },
          { tex: '\\tau', meaning: '検出器の間隔', unit: '\\mathrm{length}' },
          { tex: 'n', meaning: '検出器の番号の差（整数）', unit: '' },
        ],
      },
    ],
    snippets: ['ct-rampKernel', 'ct-filterProjection'],
    Sim: CtStep6,
  },
  {
    id: 'fbp',
    title: 'フィルタ補正逆投影',
    text: 'ランプフィルタを各投影にかけてから塗り戻して足すと、塗り戻しのぼけが打ち消され、元の断面に近い絵が戻ります。向きの数を減らすと、撮った向きに沿った放射状の筋が残ります。雑音を入れてから窓を替えると、誤差（RMSE）の小さい窓が変わります。模型の中の取っ手をつかんで楕円を動かし、フィルタなしの逆投影と並べて比べてください。',
    formulas: [
      {
        caption: '周波数から断面へ',
        tex: '\\begin{aligned} f(x,y) &= \\iint F(u,v)\\,e^{i2\\pi(ux+vy)}\\,du\\,dv \\\\ &= \\int_{0}^{\\pi}\\!\\int_{-\\infty}^{\\infty}F(w\\cos\\theta,\\,w\\sin\\theta)\\,|w|\\,e^{i2\\pi w(x\\cos\\theta+y\\sin\\theta)}\\,dw\\,d\\theta \\\\ &= \\int_{0}^{\\pi}Q_\\theta(x\\cos\\theta+y\\sin\\theta)\\,d\\theta \\end{aligned}',
        symbols: [
          { tex: 'f(x,y)', meaning: '断面の値', unit: '' },
          { tex: 'F(u,v)', meaning: '断面の 2 次元フーリエ変換', unit: '' },
          { tex: '(w,\\theta)', meaning: '周波数の極座標（距離と角度）', unit: '' },
          { tex: 'Q_\\theta', meaning: 'ランプフィルタをかけた向き θ の投影', unit: '' },
        ],
      },
    ],
    snippets: ['ct-fbp', 'ct-backproject'],
    Sim: CtStep7,
  },
  {
    id: 'denoise',
    title: '雑音を減らす（移動平均・メディアン）',
    text: '近くの値を平均すると雑音は減りますが、段差もなまります。値を小さい順に並べて真ん中を取る（メディアン）と、飛び離れた値は消え、段差は残ります。さらに、まわりを小さな領域に分けて、ばらつきのいちばん小さい領域の平均を取ると、輪郭をまたがずに平らな所だけがならされます。信号の点をつかんで高さを変え、断面の中で虫めがね（小さな四角い枠）を動かして、それぞれの計算を確かめてください。',
    formulas: [
      {
        caption: '移動平均（n × n）',
        tex: 'g_{ij}=\\frac{1}{n^{2}}\\sum_{k,l}f_{i+k,\\,j+l}',
        symbols: [
          { tex: 'g_{ij}', meaning: '出力の画素の値', unit: '' },
          { tex: 'f_{i+k,\\,j+l}', meaning: '窓の中の入力の画素の値', unit: '' },
          { tex: 'n', meaning: '窓の幅（奇数）', unit: '' },
        ],
      },
      {
        caption: 'メディアン',
        tex: 'g_{ij}=\\operatorname{median}\\{f_{i+k,\\,j+l}\\}',
        symbols: [{ tex: '\\operatorname{median}', meaning: '値を小さい順に並べたときの真ん中の値', unit: '' }],
      },
      {
        caption: 'エッジ保存平滑化（9 つの領域）',
        tex: '\\begin{aligned} g_{ij} &= \\frac{1}{|R^{*}|}\\sum_{(k,l)\\in R^{*}}f_{i+k,\\,j+l} \\\\ R^{*} &= \\underset{m=1,\\dots,9}{\\operatorname{arg\\,min}}\\ \\mathrm{Var}(R_m) \\end{aligned}',
        symbols: [
          { tex: 'R_m', meaning: '5 × 5 の窓を分けた小さな領域（9 つ）', unit: '' },
          { tex: '\\mathrm{Var}(R_m)', meaning: '領域の中の値のばらつき（分散）', unit: '' },
          { tex: 'R^{*}', meaning: 'ばらつきがいちばん小さい領域', unit: '' },
        ],
      },
    ],
    snippets: ['imageFilter-movingAverage1D', 'imageFilter-median1D', 'imageFilter-boxBlur', 'imageFilter-median', 'imageFilter-edgePreservingSmooth'],
    Sim: CtStep8,
  },
  {
    id: 'sharpen',
    title: '輪郭を強める（ラプラシアン・鮮鋭化）',
    text: '隣との差（1 回の差分）は輪郭で大きくなり、その差の差（2 回の差分、ラプラシアン）は輪郭の両側で正と負に振れます。元の画像からラプラシアンを引くと、輪郭の両側の明暗の差が強まります。k で強さを変え、断面の中で虫めがね（小さな四角い枠）を動かして、3 × 3 の重みと値から輪郭の値と鮮鋭化の値ができる様子を見てください。',
    formulas: [
      {
        caption: 'ラプラシアン（4 近傍）',
        tex: '\\begin{aligned} \\nabla^{2}f_{ij} &\\approx f_{i+1,j}+f_{i-1,j} \\\\ &\\quad +f_{i,j+1}+f_{i,j-1}-4f_{ij} \\end{aligned}',
        symbols: [{ tex: '\\nabla^{2}f_{ij}', meaning: '2 回の差分（上下左右の和から、中央の 4 倍を引く）', unit: '' }],
      },
      {
        caption: '鮮鋭化',
        tex: 'g=f-k\\,\\nabla^{2}f',
        symbols: [
          { tex: 'g', meaning: '鮮鋭化した画像', unit: '' },
          { tex: 'k', meaning: '強さ', unit: '' },
        ],
      },
      {
        caption: 'ソーベルの重み',
        tex: '\\begin{aligned} S_x &= \\begin{pmatrix}-1&0&1\\\\-2&0&2\\\\-1&0&1\\end{pmatrix} \\\\ S_y &= \\begin{pmatrix}-1&-2&-1\\\\0&0&0\\\\1&2&1\\end{pmatrix} \\end{aligned}',
        symbols: [
          { tex: 'S_x', meaning: '横の向きの 1 回の差分（縦の輪郭に強く反応する）', unit: '' },
          { tex: 'S_y', meaning: '縦の向きの 1 回の差分（横の輪郭に強く反応する）', unit: '' },
        ],
      },
    ],
    snippets: ['imageFilter-difference1D', 'imageFilter-convolve3x3', 'imageFilter-sharpen'],
    Sim: CtStep9,
  },
  {
    id: 'morphology',
    title: '形を整える（膨張・収縮・開放・閉鎖）',
    text: '形を画素の集まり X とみなし、小さな形 B（構造化要素）を使って整えます。B を X の各点に置いて広げるのが膨張、B がすっぽり X に入る点だけを残すのが収縮です。収縮してから膨張すると細い出っ張りや小さな点が消え（開放）、膨張してから収縮すると細いすき間や小さな穴が埋まります（閉鎖）。形をドラッグして描き足し、増えた画素（緑）と減った画素（赤）を見てください。',
    formulas: [
      {
        caption: '膨張',
        tex: 'X\\oplus B=\\{\\,x+b\\mid x\\in X,\\ b\\in B\\,\\}',
        symbols: [
          { tex: 'X', meaning: '形（値が 1 の画素の集まり）', unit: '' },
          { tex: 'B', meaning: '構造化要素（小さな形）', unit: '' },
        ],
      },
      {
        caption: '収縮',
        tex: 'X\\ominus B=\\{\\,x\\mid B_x\\subseteq X\\,\\}',
        symbols: [{ tex: 'B_x', meaning: '点 x に置いた B', unit: '' }],
      },
      {
        caption: '開放と閉鎖',
        tex: '\\begin{aligned} \\text{開放} &: (X\\ominus B)\\oplus B \\\\ \\text{閉鎖} &: (X\\oplus B)\\ominus B \\end{aligned}',
        symbols: [
          { tex: '\\oplus', meaning: '膨張', unit: '' },
          { tex: '\\ominus', meaning: '収縮', unit: '' },
        ],
      },
    ],
    snippets: ['imageFilter-dilate', 'imageFilter-erode', 'imageFilter-open', 'imageFilter-close'],
    Sim: CtStep10,
  },
]

export const CT_COMBINATION = {
  text: '全体は、撮る → 整える → 作り直す → 整える、の順になっている。',
  flow: [
    { steps: [1, 2], text: '向きを変えて投影を撮り、サイノグラムに並べる' },
    { steps: [8], text: '投影の雑音を減らす（前処理）' },
    { steps: [6], text: '投影ごとにランプフィルタをかける' },
    { steps: [3, 7], text: '塗り戻して足すと断面' },
    { steps: [4, 5], text: 'フィルタが |w| になる理由（フーリエ変換と中央断面定理）' },
    { steps: [9, 10], text: '作り直した断面の輪郭を強め、形を整える' },
  ],
}
