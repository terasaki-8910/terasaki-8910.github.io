import { lazy } from 'react'

const CtSim = lazy(() => import('../sims/ctSim.jsx'))
const CtStep1 = lazy(() => import('../sims/ctStep1.jsx'))
const CtStep2 = lazy(() => import('../sims/ctStep2.jsx'))
const CtStep3 = lazy(() => import('../sims/ctStep3.jsx'))
const CtStep4 = lazy(() => import('../sims/ctStep4.jsx'))
const CtStep5 = lazy(() => import('../sims/ctStep5.jsx'))
const CtStep6 = lazy(() => import('../sims/ctStep6.jsx'))
const CtStep7 = lazy(() => import('../sims/ctStep7.jsx'))
const CtStep8 = lazy(() => import('../sims/ctStep8.jsx'))
const CtStep9 = lazy(() => import('../sims/ctStep9.jsx'))
const CtStep10 = lazy(() => import('../sims/ctStep10.jsx'))

export default {
  id: 'ct',
  tabLabel: 'CT',
  title: 'CT の再構成と画像の前処理',
  intro: '体の断面を、いろいろな向きから X 線で撮った影（投影）から作り直す。作り直す前後の画像の雑音や形は、フィルタで整える。',
  overview: {
    Sim: CtSim,
    caption: '模型の小さな楕円を動かし、角度の数・フィルタ・雑音・前処理と後処理を変えると、投影の並び（サイノグラム）と作り直した断面がどう変わるかを確かめられます。',
  },
  steps: [
    {
      id: 'projection',
      title: '影を撮る（投影）',
      text: 'X 線は通り道の吸収 f の合計に応じて指数関数的に弱まるので、検出器の 1 点に届いた量の対数から、光線に沿った f の合計（線積分）が分かります。向きを決めて、平行な光線を少しずつずらして並べた結果が、その向きの投影 p(s) です。線源の丸を円に沿って動かすと向きが、検出器の丸を動かすと調べる光線が変わります。式で求めた曲線と、画素の値を光線に沿って足した点が重なること、向きによって投影の形が変わることを見てください。',
      formulas: [
        {
          caption: '投影（光線に沿った線積分）',
          tex: 'p_{\\theta}(s)=\\iint f(x,y)\\,\\delta(x\\cos\\theta+y\\sin\\theta-s)\\,dx\\,dy',
          symbols: [
            { tex: 'p_{\\theta}(s)', meaning: '向き θ、検出器の位置 s の投影の値', unit: '' },
            { tex: 'f(x,y)', meaning: '断面の各点の吸収', unit: '' },
            { tex: '\\delta', meaning: '光線の上の点だけを選ぶデルタ関数', unit: '' },
            { tex: '\\theta', meaning: 'X 線の向きを決める角度', unit: '\\mathrm{rad}' },
            { tex: 's', meaning: '検出器に沿った位置', unit: '' },
          ],
        },
        {
          caption: '楕円 1 つの投影（中心が原点で、軸が座標軸に沿うとき）',
          tex: 'p_{\\theta}(s)=\\frac{2\\rho ab\\sqrt{a^{2}(\\theta)-s^{2}}}{a^{2}(\\theta)}\\quad(|s|\\le a(\\theta)),\\qquad a^{2}(\\theta)=a^{2}\\cos^{2}\\theta+b^{2}\\sin^{2}\\theta',
          symbols: [
            { tex: '\\rho', meaning: '楕円の中の値（吸収）', unit: '' },
            { tex: 'a,\\ b', meaning: '楕円の x 方向と y 方向の半径', unit: '' },
            { tex: 'a(\\theta)', meaning: '向き θ から見た楕円の影の半幅', unit: '' },
          ],
        },
      ],
      snippets: ['ct-ellipseProjection', 'ct-projectPhantom', 'ct-lineIntegral'],
      Sim: CtStep1,
    },
    {
      id: 'sinogram',
      title: '全部の向きの影を並べる（サイノグラム）',
      text: '向きを 0° から 180° まで変えながら撮った投影を、1 本ずつ縦に積んだ画像がサイノグラムです。断面の 1 点 (x, y) は、向きが θ のとき検出器の s = x cos θ + y sin θ の位置に写るので、θ を変えるとサイノグラムの上に正弦波を描きます。再生して行が埋まる様子を見ながら、点をつかんで動かし、正弦波の位置と振れ幅が x と y でどう変わるかを確かめてください。',
      formulas: [
        {
          caption: '点が検出器に写る位置',
          tex: 's=x\\cos\\theta+y\\sin\\theta',
          symbols: [
            { tex: 's', meaning: '検出器に沿った位置', unit: '' },
            { tex: '(x,\\ y)', meaning: '断面の点の座標', unit: '' },
            { tex: '\\theta', meaning: 'X 線の向きを決める角度', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: 'サイノグラム（向きごとの投影を並べた画像）',
          tex: 'P(\\theta,s)=p_{\\theta}(s)',
          symbols: [
            { tex: 'P(\\theta,s)', meaning: 'サイノグラムの、向き θ・位置 s の画素の値', unit: '' },
            { tex: 'p_{\\theta}(s)', meaning: '向き θ の投影', unit: '' },
          ],
        },
      ],
      snippets: ['ct-sinogram'],
      Sim: CtStep2,
    },
    {
      id: 'back-projection',
      title: '影を塗り戻す（逆投影）',
      text: '逆投影は、検出器で得た値を、その光線が通ったすべての場所に同じ値で塗り戻すことです。向きごとに塗り戻した縞を足し合わせると、もとの形が浮かんできますが、各点のまわりに距離とともに薄れるもやが残るため、像はぼけます。角度の数を変えるか再生して 1 本ずつ増やし、数が少ないときの星形の筋と、増やしてもぼけが残る様子を見てください。',
      formulas: [
        {
          caption: '逆投影',
          tex: 'b(x,y)=\\int_{0}^{\\pi}p_{\\theta}(x\\cos\\theta+y\\sin\\theta)\\,d\\theta',
          symbols: [
            { tex: 'b(x,y)', meaning: '逆投影の像（点 (x, y) の値）', unit: '' },
            { tex: 'p_{\\theta}', meaning: '向き θ の投影', unit: '' },
            { tex: '\\theta', meaning: 'X 線の向きを決める角度', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: '角度を N 個に分けた和',
          tex: 'b(x,y)\\approx\\frac{\\pi}{N}\\sum_{k=0}^{N-1}p_{\\theta_{k}}(x\\cos\\theta_{k}+y\\sin\\theta_{k}),\\qquad\\theta_{k}=\\frac{k\\pi}{N}',
          symbols: [
            { tex: 'N', meaning: '角度の数', unit: '' },
            { tex: 'k', meaning: '向きの番号（0 から N − 1）', unit: '' },
            { tex: '\\theta_{k}', meaning: 'k 番目の向き', unit: '\\mathrm{rad}' },
          ],
        },
      ],
      snippets: ['ct-backproject'],
      Sim: CtStep3,
    },
    {
      id: 'fourier',
      title: '波に分ける（フーリエ変換）',
      text: 'どんな信号も、いろいろな周波数の正弦波の和で表せます。角ばった矩形波も、奇数倍の周波数の波 sin(kt) を 4/(πk) 倍して足していくと形が近づき、その振れ幅が棒グラフです。どの周波数がどれだけ含まれるかを求める操作がフーリエ変換で、点は FFT で求めた値です。K を変えて（棒グラフの上をドラッグしても変わります）、足す波が増えるほど形が近づくことと、跳びの所に行き過ぎが残ることを見てください。',
      formulas: [
        {
          caption: '矩形波のフーリエ級数',
          tex: 'f(t)=\\frac{4}{\\pi}\\sum_{k=1,3,5,\\dots}\\frac{\\sin kt}{k}',
          symbols: [
            { tex: 'f(t)', meaning: '矩形波（周期 2π、値は ±1）', unit: '' },
            { tex: 'k', meaning: '周波数の番号（奇数）', unit: '' },
            { tex: 't', meaning: '時間に当たる変数', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: 'フーリエ変換と逆変換',
          tex: 'F(\\omega)=\\int_{-\\infty}^{\\infty}f(t)\\,e^{-i\\omega t}\\,dt,\\qquad f(t)=\\frac{1}{2\\pi}\\int_{-\\infty}^{\\infty}F(\\omega)\\,e^{i\\omega t}\\,d\\omega',
          symbols: [
            { tex: 'F(\\omega)', meaning: '周波数 ω の成分の大きさ（複素数）', unit: '' },
            { tex: '\\omega', meaning: '角周波数', unit: '' },
          ],
        },
        {
          caption: '離散フーリエ変換（FFT で速く計算する）',
          tex: 'X_{k}=\\sum_{m=0}^{N-1}x_{m}\\,e^{-2\\pi i\\,km/N}',
          symbols: [
            { tex: 'x_{m}', meaning: 'm 番目の標本', unit: '' },
            { tex: 'X_{k}', meaning: 'k 番目の周波数の成分', unit: '' },
            { tex: 'N', meaning: '標本の数', unit: '' },
          ],
        },
      ],
      snippets: ['ct-squareWavePartialSum', 'fft-fft'],
      Sim: CtStep4,
    },
    {
      id: 'central-slice',
      title: '投影の周波数は断面の周波数の 1 本の線（中央断面定理）',
      text: '断面を 2 次元でフーリエ変換した画像の、原点を通る向き θ の 1 本の線に沿った値は、向き θ の投影 p(s) を 1 次元でフーリエ変換したものと一致します。線の端の丸をつかんで θ を変え、投影の 1 次元の周波数（線）と、2 次元の周波数のその線に沿った値（点）がどの向きでも重なることを見てください。全部の向きの線を集めれば 2 次元の周波数がそろい、逆フーリエ変換で断面が戻ります。',
      formulas: [
        {
          caption: '中央断面定理',
          tex: 'P_{\\theta}(w)=F(w\\cos\\theta,\\ w\\sin\\theta)',
          symbols: [
            { tex: 'P_{\\theta}(w)', meaning: '向き θ の投影の 1 次元フーリエ変換', unit: '' },
            { tex: 'F(u,v)', meaning: '断面の 2 次元フーリエ変換', unit: '' },
            { tex: 'w', meaning: '線に沿った周波数', unit: '' },
            { tex: '\\theta', meaning: '線の向きを決める角度', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: '投影の 1 次元フーリエ変換',
          tex: 'P_{\\theta}(w)=\\int_{-\\infty}^{\\infty}p_{\\theta}(s)\\,e^{-i2\\pi ws}\\,ds',
          symbols: [
            { tex: 'p_{\\theta}(s)', meaning: '向き θ の投影', unit: '' },
            { tex: 's', meaning: '検出器に沿った位置', unit: '' },
          ],
        },
        {
          caption: '断面の 2 次元フーリエ変換',
          tex: 'F(u,v)=\\iint f(x,y)\\,e^{-i2\\pi(ux+vy)}\\,dx\\,dy',
          symbols: [
            { tex: 'f(x,y)', meaning: '断面の各点の吸収', unit: '' },
            { tex: '(u,\\ v)', meaning: 'x 方向と y 方向の周波数', unit: '' },
          ],
        },
      ],
      snippets: ['ct-sampleSpectrumLine', 'fft-fft2D'],
      Sim: CtStep5,
    },
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
            { tex: 'w', meaning: '周波数', unit: '' },
            { tex: '|w|', meaning: 'ランプフィルタ（極座標の面積の要素）', unit: '' },
          ],
        },
        {
          caption: '空間のカーネル（検出器の間隔 τ）',
          tex: '\\begin{aligned} h(0) &= \\frac{1}{4\\tau^{2}} \\\\ h(n) &= \\begin{cases}0 & (n\\ \\text{が偶数})\\\\ -\\dfrac{1}{n^{2}\\pi^{2}\\tau^{2}} & (n\\ \\text{が奇数})\\end{cases} \\end{aligned}',
          symbols: [
            { tex: 'h(n)', meaning: 'ランプフィルタをたたみ込みで書いたときの係数', unit: '' },
            { tex: '\\tau', meaning: '検出器の間隔', unit: '' },
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
          tex: '\\begin{aligned} g_{ij} &= \\frac{1}{|R^{*}|}\\sum_{(k,l)\\in R^{*}}f_{i+k,\\,j+l} \\\\ R^{*} &= \\operatorname*{arg\\,min}_{m=1,\\dots,9}\\ \\mathrm{Var}(R_m) \\end{aligned}',
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
  ],
  combination: {
    text: '全体は、撮る → 整える → 作り直す → 整える、の順になっている。',
    flow: [
      { steps: [1, 2], text: '向きを変えて投影を撮り、サイノグラムに並べる' },
      { steps: [8], text: '投影の雑音を減らす（前処理）' },
      { steps: [6], text: '投影ごとにランプフィルタをかける' },
      { steps: [3, 7], text: '塗り戻して足すと断面' },
      { steps: [4, 5], text: 'フィルタが |w| になる理由（フーリエ変換と中央断面定理）' },
      { steps: [9, 10], text: '作り直した断面の輪郭を強め、形を整える' },
    ],
  },
  sources: [
    { text: 'J. Radon, Über die Bestimmung von Funktionen durch ihre Integralwerte längs gewisser Mannigfaltigkeiten, Berichte der Sächsischen Akademie der Wissenschaften zu Leipzig, Math.-Phys. Klasse 69, 262–277, 1917' },
    { text: 'R. N. Bracewell, Strip integration in radio astronomy, Australian J. Physics 9(2), 198–217, 1956' },
    { text: 'G. N. Ramachandran, A. V. Lakshminarayanan, Three-dimensional reconstruction from radiographs and electron micrographs, PNAS 68(9), 2236–2240, 1971' },
    { text: 'L. A. Shepp, B. F. Logan, The Fourier reconstruction of a head section, IEEE Transactions on Nuclear Science 21(3), 21–43, 1974' },
    { text: 'A. C. Kak, M. Slaney, Principles of Computerized Tomographic Imaging, IEEE Press, 1988' },
    { text: 'P. Toft, The Radon Transform: Theory and Implementation, PhD thesis, Technical University of Denmark, 1996' },
    { text: 'J. W. Cooley, J. W. Tukey, An algorithm for the machine calculation of complex Fourier series, Mathematics of Computation 19(90), 297–301, 1965' },
    { text: 'J. W. Tukey, Exploratory Data Analysis, Addison-Wesley, 1977' },
    { text: 'M. Nagao, T. Matsuyama, Edge preserving smoothing, Computer Graphics and Image Processing 9(5), 394–407, 1979' },
    { text: 'J. Serra, Image Analysis and Mathematical Morphology, Academic Press, 1982' },
    { text: 'R. C. Gonzalez, R. E. Woods, Digital Image Processing, 4th ed., Pearson, 2018' },
  ],
}
