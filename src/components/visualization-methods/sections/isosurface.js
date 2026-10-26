import { lazy } from 'react'

const IsosurfaceSim = lazy(() => import('../sims/isosurfaceSim.jsx'))
const IsosurfaceStep1 = lazy(() => import('../sims/isosurfaceStep1.jsx'))
const IsosurfaceStep2 = lazy(() => import('../sims/isosurfaceStep2.jsx'))
const IsosurfaceStep3 = lazy(() => import('../sims/isosurfaceStep3.jsx'))
const IsosurfaceStep4 = lazy(() => import('../sims/isosurfaceStep4.jsx'))

export default {
  id: 'isosurface',
  tabLabel: '等値面',
  title: '等値面の抽出',
  intro: '格子の点に値が並んだデータから、値がちょうど決めた値（しきい値）になる線や面を取り出す。粒子をつかんで動かせる。',
  overview: {
    Sim: IsosurfaceSim,
    caption: '粒子、しきい値、格子数を変えながら、場から等値線や等値面が取り出される様子を確かめられます。',
  },
  steps: [
    {
      id: 'interpolation',
      title: '格子の点のあいだの値（線形補間）',
      text: '値があるのは格子点だけなので、そのあいだは端の値を距離の割合で分けて作ります。2 次元では横方向に 2 回、その結果を縦方向に 1 回補間し、3 次元ではさらに奥行き方向に 1 回補間します。角の縦棒と点をつかみ、中間の線と点の値が連続して変わる様子を見てください。',
      formulas: [
        {
          caption: '双線形補間',
          tex: 'f = f_{00}(1-\\alpha)(1-\\beta) + f_{10}\\alpha(1-\\beta) + f_{01}(1-\\alpha)\\beta + f_{11}\\alpha\\beta',
          symbols: [
            { tex: '\\alpha = x - x_0', meaning: 'マスの中の横方向の割合', unit: '' },
            { tex: '\\beta = y - y_0', meaning: 'マスの中の縦方向の割合', unit: '' },
          ],
        },
        {
          caption: '3 重線形補間',
          tex: 'f = f_C(1-\\gamma) + f_D\\gamma',
          symbols: [
            { tex: 'f_C,\\ f_D', meaning: '手前と奥の面で求めた双線形補間の値', unit: '' },
            { tex: '\\gamma', meaning: '奥行き方向の割合', unit: '' },
          ],
        },
      ],
      snippets: ['isosurface-bilinear', 'isosurface-trilinear'],
      Sim: IsosurfaceStep1,
    },
    {
      id: 'implicit',
      title: '値が 0 になる所が表面（陰関数）',
      text: '陰関数では、値がちょうど 0 になる点の集まりを線や面として表し、符号で内側と外側を区別します。値が最も速く増える勾配は表面に直角なので法線になり、その向きの広がり方が曲率です。点をつかんで勾配と単位法線を動かし、円周上の曲率が半径の逆数になることを見てください。',
      formulas: [
        {
          caption: '陰関数と法線',
          tex: 'f(\\boldsymbol{x}) = 0,\\qquad \\boldsymbol{n} = \\nabla f = \\left(\\frac{\\partial f}{\\partial x},\\frac{\\partial f}{\\partial y},\\frac{\\partial f}{\\partial z}\\right)',
          symbols: [
            { tex: 'f', meaning: '符号で内外を表す場', unit: '' },
            { tex: '\\boldsymbol{n}', meaning: '表面に垂直な法線', unit: '' },
          ],
        },
        {
          caption: '曲率と円の例',
          tex: '\\kappa = \\nabla\\cdot\\left(\\frac{\\nabla f}{|\\nabla f|}\\right),\\qquad \\nabla f = (2x,2y),\\qquad \\kappa = \\frac{1}{\\sqrt{x^2+y^2}}',
          symbols: [
            { tex: '\\kappa', meaning: '法線方向の広がりを表す曲率', unit: '' },
          ],
        },
      ],
      snippets: ['isosurface-gradient2D', 'isosurface-curvature2D'],
      Sim: IsosurfaceStep2,
    },
    {
      id: 'metaball',
      title: '粒子から場を作る（メタボール）',
      text: '各粒子に、中心で高く距離 R で 0 になる山を置き、すべて足してからしきい値 T を引きます。粒子が近づくと山が足し合わされて T を超え、別々の形が一つにつながります。粒子と断面線をつかみ、粒子法による液体の表面がどのように生まれるかをグラフと見比べてください。',
      formulas: [
        {
          caption: 'メタボールの場',
          tex: 'f(\\boldsymbol{x}) = \\sum_i b_i W(|\\boldsymbol{x}-\\boldsymbol{x}_i|) - T',
          symbols: [
            { tex: 'b_i', meaning: '粒子 i の強さ', unit: '' },
            { tex: 'T', meaning: '形の境界を決めるしきい値', unit: '' },
          ],
        },
        {
          caption: '粒子 1 個の重み',
          tex: 'W(r) = \\begin{cases}(1-r^2/R^2)^3 & (r<R)\\\\0 & (\\text{それ以外})\\end{cases}',
          symbols: [
            { tex: 'r', meaning: '粒子中心からの距離', unit: '' },
            { tex: 'R', meaning: '山が 0 になる半径', unit: '' },
          ],
        },
      ],
      snippets: ['isosurface-metaballWeight', 'isosurface-metaballField'],
      Sim: IsosurfaceStep3,
    },
    {
      id: 'mls',
      title: '点の集まりから曲線を作る（移動最小二乗）',
      text: '測定点が散らばっているときは、照会位置 q に近い点ほど重くして、誤差の 2 乗の合計が最小になる 2 次式を当てはめます。誤差は係数 c の 2 次式なので、各係数で微分して 0 と置くと連立 1 次方程式として解けます。q をつかんで動かし、幅 h が小さいと雑音を追い、大きいとなめらかになりすぎる違いを見てください。',
      formulas: [
        {
          caption: '重み付き最小二乗',
          tex: 'E(\\boldsymbol{c}) = \\sum_i \\theta(|x_i-q|)\\left(\\boldsymbol{b}(x_i)^\\mathsf{T}\\boldsymbol{c}-g_i\\right)^2',
          symbols: [
            { tex: 'q', meaning: '曲線の値を求める照会位置', unit: '' },
            { tex: 'g_i', meaning: '測定点 i の値', unit: '' },
          ],
        },
        {
          caption: '正規方程式の解',
          tex: '\\boldsymbol{c} = \\left(\\sum_i \\theta_i\\boldsymbol{b}_i\\boldsymbol{b}_i^\\mathsf{T}\\right)^{-1}\\sum_i \\theta_i\\boldsymbol{b}_i g_i',
          symbols: [
            { tex: '\\boldsymbol{c}', meaning: '局所 2 次式の 3 つの係数', unit: '' },
          ],
        },
        {
          caption: '重みと基底',
          tex: '\\theta(d)=\\exp(-d^2/h^2),\\qquad \\boldsymbol{b}(x)=(1,x-q,(x-q)^2)^\\mathsf{T}',
          symbols: [
            { tex: 'h', meaning: '近くの点を重くする範囲', unit: '' },
          ],
        },
      ],
      snippets: ['isosurface-weightedLeastSquares', 'isosurface-solveLinear'],
      Sim: IsosurfaceStep4,
    },
  ],
  combination: {
    text: 'ここまでの 4 段階では、格子間の値を補い、0 の場所とその幾何を読み、粒子や測定点から場を組み立てます。',
    flow: [
      { steps: [1, 2], text: '格子点の値を補間し、値が 0 になる場所を線や面として読み取ります。' },
      { steps: [3, 4], text: '粒子の山や散らばった測定点から、連続した場や曲線を作ります。' },
    ],
  },
  sources: [
    { text: 'W. E. Lorensen, H. E. Cline, Marching cubes: A high resolution 3D surface construction algorithm, SIGGRAPH \'87, 163–169, 1987' },
    { text: 'G. M. Nielson, B. Hamann, The asymptotic decider: resolving the ambiguity in marching cubes, IEEE Visualization \'91, 83–91, 1991' },
    { text: 'J. F. Blinn, A generalization of algebraic surface drawing, ACM Transactions on Graphics 1(3), 235–256, 1982' },
    { text: 'M. Müller, D. Charypar, M. Gross, Particle-based fluid simulation for interactive applications, SCA 2003, 154–159' },
    { text: 'P. Lancaster, K. Šalkauskas, Surfaces generated by moving least squares methods, Mathematics of Computation 37(155), 141–158, 1981' },
    { text: 'M. Alexa et al., Computing and rendering point set surfaces, IEEE TVCG 9(1), 3–15, 2003' },
    { text: 'S. Osher, J. A. Sethian, Fronts propagating with curvature-dependent speed, J. Computational Physics 79(1), 12–49, 1988' },
    { text: 'M. Sussman, P. Smereka, S. Osher, A level set approach for computing solutions to incompressible two-phase flow, J. Computational Physics 114(1), 146–159, 1994' },
    { text: 'J. A. Sethian, A fast marching level set method for monotonically advancing fronts, PNAS 93(4), 1591–1595, 1996' },
    { text: 'S. T. Zalesak, Fully multidimensional flux-corrected transport algorithms for fluids, J. Computational Physics 31(3), 335–362, 1979' },
  ],
}
