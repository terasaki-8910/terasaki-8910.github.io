import { lazy } from 'react'

const CtSim = lazy(() => import('../sims/ctSim.jsx'))
const CtStep1 = lazy(() => import('../sims/ctStep1.jsx'))
const CtStep2 = lazy(() => import('../sims/ctStep2.jsx'))
const CtStep3 = lazy(() => import('../sims/ctStep3.jsx'))
const CtStep4 = lazy(() => import('../sims/ctStep4.jsx'))
const CtStep5 = lazy(() => import('../sims/ctStep5.jsx'))

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
            { tex: 's', meaning: '検出器に沿った位置', unit: '\\mathrm{length}' },
          ],
        },
        {
          caption: '楕円 1 つの投影（中心が原点で、軸が座標軸に沿うとき）',
          tex: 'p_{\\theta}(s)=\\frac{2\\rho ab\\sqrt{a^{2}(\\theta)-s^{2}}}{a^{2}(\\theta)}\\quad(|s|\\le a(\\theta)),\\qquad a^{2}(\\theta)=a^{2}\\cos^{2}\\theta+b^{2}\\sin^{2}\\theta',
          symbols: [
            { tex: '\\rho', meaning: '楕円の中の値（吸収）', unit: '' },
            { tex: 'a,\\ b', meaning: '楕円の x 方向と y 方向の半径', unit: '\\mathrm{length}' },
            { tex: 'a(\\theta)', meaning: '向き θ から見た楕円の影の半幅', unit: '\\mathrm{length}' },
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
            { tex: 's', meaning: '検出器に沿った位置', unit: '\\mathrm{length}' },
            { tex: '(x,\\ y)', meaning: '断面の点の座標', unit: '\\mathrm{length}' },
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
            { tex: '\\omega', meaning: '角周波数', unit: '\\mathrm{rad}/\\mathrm{time}' },
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
            { tex: 'w', meaning: '線に沿った周波数', unit: '\\mathrm{length}^{-1}' },
            { tex: '\\theta', meaning: '線の向きを決める角度', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: '投影の 1 次元フーリエ変換',
          tex: 'P_{\\theta}(w)=\\int_{-\\infty}^{\\infty}p_{\\theta}(s)\\,e^{-i2\\pi ws}\\,ds',
          symbols: [
            { tex: 'p_{\\theta}(s)', meaning: '向き θ の投影', unit: '' },
            { tex: 's', meaning: '検出器に沿った位置', unit: '\\mathrm{length}' },
          ],
        },
        {
          caption: '断面の 2 次元フーリエ変換',
          tex: 'F(u,v)=\\iint f(x,y)\\,e^{-i2\\pi(ux+vy)}\\,dx\\,dy',
          symbols: [
            { tex: 'f(x,y)', meaning: '断面の各点の吸収', unit: '' },
            { tex: '(u,\\ v)', meaning: 'x 方向と y 方向の周波数', unit: '\\mathrm{length}^{-1}' },
          ],
        },
      ],
      snippets: ['ct-sampleSpectrumLine', 'fft-fft2D'],
      Sim: CtStep5,
    },
  ],
  // 段階 6〜10 を足すときに、組み合わせも全体で書き直す(これは段階 1〜5 だけの仮のもの)
  combination: {
    text: '全体は、向きを変えて影（投影）を撮り、サイノグラムに並べ、塗り戻して断面を作ります。フーリエ変換と中央断面定理は、塗り戻しだけではぼける理由を周波数で説明します。',
    flow: [
      { steps: [1, 2], text: '向きを変えて投影を撮り、サイノグラムに並べる' },
      { steps: [3], text: '投影を塗り戻して足すと、断面の形が浮かぶ（ぼけは残る）' },
      { steps: [4, 5], text: 'ぼけの理由を周波数で考える（フーリエ変換と中央断面定理）' },
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
