// 節「流体（SPH）」のデータ。形は sections/index.js を見る。
// 式は utils/vis/sph.js の実装に合わせた形（2 次元）。単位は 2 次元（奥行き 1 の薄い板）で数えたもの。
// 段階 1 だけは、図が 1 次元なので、核の係数と単位を 1 次元で書く。
import FluidSim from '../sims/FluidSim.jsx'
import FluidStep1 from '../sims/fluidStep1.jsx'
import FluidStep2 from '../sims/fluidStep2.jsx'
import FluidStep3 from '../sims/fluidStep3.jsx'
import FluidStep4 from '../sims/fluidStep4.jsx'
import FluidStep5 from '../sims/fluidStep5.jsx'
import FluidStep6 from '../sims/fluidStep6.jsx'
import FluidStep7 from '../sims/fluidStep7.jsx'

export default {
  id: 'fluid',
  title: '流体（SPH）',
  tabLabel: '流体',
  intro:
    '水を粒子の集まりで表して、積んだ水の塊が崩れて広がるようすを 2 次元で動かす（SPH）。まず全体を動かし、そのあと、計算を 1 つずつ小さなシミュレーションで確かめて、最後に組み合わせる。',
  overview: {
    Sim: FluidSim,
    caption:
      '水の塊を、ドラッグで近くの粒子を押してかき混ぜられる。粒子の色は、速さか密度で切り替えられる。「グリッド」を入れると、近くの粒子を探すセルが見える。',
  },
  steps: [
    {
      id: 'weight',
      title: '粒子で量を表す（重み関数）',
      text: '粒子と粒子のあいだの場所の値は、近くの粒子の値を、近いほど重く足し合わせて求める。この重みの形が核 W で、影響半径 h より遠い粒子の重みは 0。W は、全部の重みを足すと 1 になるように（面積が 1 になるように）そろえてあるので、どの粒子も同じ値なら、足し合わせてもその値に戻る。h を大きくすると、遠くの粒子まで混ざって、曲線がなだらかになる。',
      formulas: [
        {
          id: 'approximation',
          caption: '粒子の値を重みをつけて足す（1 次元）と、核の条件（重みの面積が 1）',
          tex: String.raw`\begin{aligned}
A(x) &\approx \sum_j \frac{m_j}{\rho_j}\,A_j\,W\bigl(\lvert x-x_j\rvert,\,h\bigr) \\
\int W(\lvert x\rvert,\,h)\,dx &= 1,\qquad W(r,\,h) = 0\quad (r \ge h)
\end{aligned}`,
          symbols: [
            { tex: 'A,\\ A_j', meaning: '場の量（温度や速度など）と、粒子 j が持つ値', unit: '' },
            { tex: 'x,\\ x_j', meaning: '値を求める位置と、粒子 j の位置', unit: '\\mathrm{m}' },
            { tex: 'm_j,\\ \\rho_j', meaning: '粒子 j の質量と、その場所の密度', unit: '\\mathrm{kg},\\ \\mathrm{kg/m}' },
            { tex: 'V_j = m_j/\\rho_j', meaning: '粒子 j が占める長さ（2 次元では面積）', unit: '\\mathrm{m}' },
            { tex: 'W', meaning: '核。近いほど大きく、距離が h 以上で 0 になる重み', unit: '\\mathrm{m^{-1}}' },
            { tex: 'h', meaning: '影響半径', unit: '\\mathrm{m}' },
          ],
        },
        {
          id: 'cubic-spline',
          caption: '3 次スプライン核の例（q は距離を h/2 で割った値。2 次元では係数が 10/(7πs²)、s = h/2 になる）',
          tex: String.raw`W(r,\,h) = \frac{4}{3h}\begin{cases}
1 - \tfrac{3}{2}q^{2} + \tfrac{3}{4}q^{3} & (0 \le q < 1) \\
\tfrac{1}{4}\,(2-q)^{3} & (1 \le q < 2) \\
0 & (q \ge 2)
\end{cases},\qquad q = \frac{2r}{h}`,
        },
      ],
      snippets: ['sph-cubicSpline', 'sph-sphInterpolate'],
      Sim: FluidStep1,
    },
    {
      id: 'density',
      title: '密度',
      text: '密度は、そこにどれだけ粒子が詰まっているかを表す。粒子 i のまわり（半径 h）にいる粒子の質量に、距離に応じた重みをかけて足したものが密度 ρ。近くに粒子が多いほど、近いほど大きくなる。水面のそばの粒子は外側に粒子がいないので、小さく出る。',
      formulas: [
        {
          id: 'density',
          caption: '密度（和）と、密度用の核（2 次元用の係数。3 次元の定数はそのままでは使えない）',
          tex: String.raw`\begin{aligned}
\rho_i &= \sum_j m\,W_{\mathrm{poly6}}\bigl(\lvert\mathbf{x}_i-\mathbf{x}_j\rvert,\,h\bigr) \\
W_{\mathrm{poly6}}(r,\,h) &= \frac{4}{\pi h^{8}}\,(h^{2}-r^{2})^{3}\quad (r < h)
\end{aligned}`,
          symbols: [
            { tex: '\\rho_i', meaning: '粒子 i の密度（j は i 自身も含む）', unit: '\\mathrm{kg/m^2}' },
            { tex: 'm', meaning: '粒子 1 個の質量（全部同じ）', unit: '\\mathrm{kg}' },
            { tex: 'W_{\\mathrm{poly6}}', meaning: '密度用の核', unit: '\\mathrm{m^{-2}}' },
            { tex: 'r', meaning: '粒子 i から粒子 j までの距離（r ≥ h では 0）', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['sph-poly6', 'sph-computeDensity'],
      Sim: FluidStep2,
    },
    {
      id: 'pressure',
      title: '圧力（状態方程式）',
      text: '水は縮みにくい。そこで、密度が基準の ρ0（休止密度）より大きくなったぶんに比例して、押し返す圧力 p を割り当てる（一次関数）。粒子を詰めるほど密度が上がり、圧力が大きくなる。この実装では、ρ が ρ0 より小さいときは圧力を 0 にして、粒子どうしが引き合わないようにしている。',
      formulas: [
        {
          id: 'pressure',
          caption: '状態方程式（この実装では p < 0 を 0 に切る）',
          tex: String.raw`p_i = k\,(\rho_i - \rho_0)`,
          symbols: [
            { tex: 'p_i', meaning: '圧力', unit: '\\mathrm{N/m}' },
            { tex: 'k', meaning: '圧力の係数（音速の 2 乗にあたる。大きいほど縮みにくい）', unit: '\\mathrm{m^2/s^2}' },
            { tex: '\\rho_0', meaning: '休止密度（この密度で圧力が 0）', unit: '\\mathrm{kg/m^2}' },
          ],
        },
      ],
      snippets: ['sph-computePressure'],
      Sim: FluidStep3,
    },
    {
      id: 'pressure-force',
      title: '圧力の力',
      text: '圧力が高い所から低い所へ、粒子は押される。粒子 i が受ける力は、近くの粒子 j との組ごとに、圧力と、核の勾配（傾き）で決まる。組 (i, j) の力は向きが逆で大きさが同じなので、水全体では運動量が保たれる。力は、粒子が離れる向きに働く。',
      formulas: [
        {
          id: 'gradient',
          caption: '勾配（傾き）の近似。圧力の力はこの形をもとに、組で対称になるよう直したもの',
          tex: String.raw`\nabla A(\mathbf{x}) \approx \sum_j \frac{m_j}{\rho_j}\,A_j\,\nabla W\bigl(\lvert\mathbf{x}-\mathbf{x}_j\rvert,\,h\bigr)`,
          symbols: [{ tex: '\\nabla', meaning: '位置についての傾き（x と y の微分を並べたもの）', unit: '' }],
        },
        {
          id: 'pressure-force',
          caption: '圧力の力（対称な形）と、圧力用の核の勾配（2 次元用の係数）',
          tex: String.raw`\begin{aligned}
\mathbf{F}_i^{\mathrm{press}} &= -\sum_j m^2\left(\frac{p_i}{\rho_i^{2}}+\frac{p_j}{\rho_j^{2}}\right)\nabla W_{\mathrm{spiky}}\bigl(\mathbf{x}_i-\mathbf{x}_j,\,h\bigr) \\
\nabla W_{\mathrm{spiky}}(\mathbf{r},\,h) &= -\frac{30}{\pi h^{5}}\,(h-r)^{2}\,\frac{\mathbf{r}}{r}\quad (r < h)
\end{aligned}`,
          symbols: [
            { tex: '\\mathbf{F}_i^{\\mathrm{press}}', meaning: '粒子 i が圧力から受ける力（組 (i, j) の力は逆向きで同じ大きさ）', unit: '\\mathrm{N}' },
            { tex: '\\nabla W_{\\mathrm{spiky}}', meaning: '圧力用の核の勾配（中心でも 0 にならない）', unit: '\\mathrm{m^{-3}}' },
            { tex: '\\mathbf{r},\\ r', meaning: '粒子 i から見た粒子 j の相対位置 x_i − x_j と、その長さ', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['sph-spikyGrad', 'sph-computeForces'],
      Sim: FluidStep4,
    },
    {
      id: 'viscosity',
      title: '粘性の力',
      text: '速さの違う粒子が隣り合うと、速い粒子は遅くなり、遅い粒子は速くなる。粒子 i は、近くの粒子の速度との差に比例した力を受けて、まわりの速度に近づく。粘性 μ が大きいほど速く近づき、ずれる流れがなめらかになる。',
      formulas: [
        {
          id: 'viscosity-force',
          caption: '粘性の力と、粘性用の核のラプラシアン（2 次元用の係数）',
          tex: String.raw`\begin{aligned}
\mathbf{F}_i^{\mathrm{visc}} &= \mu \sum_j m^2\,\frac{\mathbf{v}_j-\mathbf{v}_i}{\rho_i\,\rho_j}\,\nabla^{2} W_{\mathrm{visc}}\bigl(\lvert\mathbf{x}_i-\mathbf{x}_j\rvert,\,h\bigr) \\
\nabla^{2} W_{\mathrm{visc}}(r,\,h) &= \frac{40}{\pi h^{5}}\,(h-r)\quad (r < h)
\end{aligned}`,
          symbols: [
            { tex: '\\mu', meaning: '粘性係数', unit: '\\mathrm{kg/s}' },
            { tex: '\\mathbf{v}_i,\\ \\mathbf{v}_j', meaning: '粒子の速度', unit: '\\mathrm{m/s}' },
            { tex: '\\nabla^{2} W_{\\mathrm{visc}}', meaning: '粘性用の核のラプラシアン', unit: '\\mathrm{m^{-4}}' },
          ],
        },
      ],
      snippets: ['sph-viscLaplacian', 'sph-computeForces'],
      Sim: FluidStep5,
    },
    {
      id: 'neighbors',
      title: '近傍探索（均一グリッド）',
      text: '密度も力も、半径 h の中の粒子だけが効く。粒子の全部の組を調べると N(N−1)/2 回かかるので、まず領域を 1 辺 h のセルに区切って粒子を振り分け、自分のセルと隣の 8 セルだけを調べる。調べる組の数は粒子の数 N におおよそ比例するので、粒子が増えても計算が間に合う。',
      formulas: [
        {
          id: 'cell',
          caption: '粒子が入るセル',
          tex: String.raw`(c_x,\ c_y) = \left(\lfloor x/h\rfloor,\ \lfloor y/h\rfloor\right)`,
          symbols: [
            { tex: 'c_x,\\ c_y', meaning: 'セルの番号（x 方向、y 方向）。1 辺が h のセルなので、距離 h 以内の粒子は隣のセルまでにいる', unit: '' },
            { tex: '\\lfloor\\ \\rfloor', meaning: '小数点以下を切り捨てる', unit: '' },
          ],
        },
        {
          id: 'cost',
          caption: '調べる組の数（総当たりとグリッド）',
          tex: String.raw`\underbrace{\frac{N(N-1)}{2}}_{\text{総当たり}}\quad\text{に対して}\quad \underbrace{\approx \frac{9\,\bar n\,N}{2}}_{\text{グリッド}}`,
          symbols: [
            { tex: 'N', meaning: '粒子の数', unit: '' },
            { tex: '\\bar n', meaning: '1 つのセルにいる粒子の数の平均', unit: '' },
          ],
        },
      ],
      snippets: ['sph-UniformGrid', 'sph-findPairs'],
      Sim: FluidStep6,
    },
    {
      id: 'timestep',
      title: '時間の進め方',
      text: '力から加速度を求め、速度を Δt ぶん更新してから、その新しい速度で位置を更新する（半陰的オイラー法）。Δt を大きくしすぎると、圧力の力が行き過ぎて粒子が暴れ出す。圧力の変化（音）は速さ √k で伝わるので、Δt は、その波が影響半径 h を進む時間より短くする。この実装で動作を確かめた目安は Δt ≤ 0.3·h/√k。',
      formulas: [
        {
          id: 'semi-implicit',
          caption: '半陰的オイラー法（速度を先に更新する）',
          tex: String.raw`\begin{aligned}
\mathbf{v}_i &\leftarrow \mathbf{v}_i + \Delta t\left(\frac{\mathbf{F}_i}{m} + \mathbf{g}\right) \\
\mathbf{x}_i &\leftarrow \mathbf{x}_i + \Delta t\,\mathbf{v}_i
\end{aligned}`,
          symbols: [
            { tex: '\\Delta t', meaning: '1 ステップの時間', unit: '\\mathrm{s}' },
            { tex: '\\mathbf{F}_i', meaning: '圧力の力と粘性の力の和', unit: '\\mathrm{N}' },
            { tex: '\\mathbf{g}', meaning: '重力加速度', unit: '\\mathrm{m/s^2}' },
          ],
        },
        {
          id: 'timestep',
          caption: '時間刻みの目安（この実装で動作を確かめた値）',
          tex: String.raw`\Delta t \le C\,\frac{h}{\sqrt{k}},\qquad C = 0.3`,
          symbols: [
            { tex: '\\Delta t', meaning: '1 ステップの時間', unit: '\\mathrm{s}' },
            { tex: 'h/\\sqrt{k}', meaning: '音が影響半径の分だけ進む時間', unit: '\\mathrm{s}' },
          ],
        },
      ],
      snippets: ['sph-sphStep', 'sph-reflectAtWalls'],
      Sim: FluidStep7,
    },
  ],
  combination: {
    text: '重み関数（段階 1）は、段階 2〜5 のどの計算にも使う。全体のシミュレーションは、次の順を 1 ステップとして、Δt ずつ時間を進めている。',
    flow: [
      { steps: [6], text: '粒子をセルに振り分けて、近くの粒子の組を探す' },
      { steps: [2], text: '組ごとに重みを足して、粒子の密度を求める' },
      { steps: [3], text: '密度から圧力を求める' },
      { steps: [4, 5], text: '圧力の力と粘性の力を求める（重力を足して加速度にする）' },
      { steps: [7], text: '速度、位置の順に Δt だけ進める（Δt は音速で決まる上限以下）' },
    ],
  },
  sources: [
    {
      text: 'Monaghan, J. J., Smoothed particle hydrodynamics, Annual Review of Astronomy and Astrophysics 30, 543–574 (1992)',
      href: 'https://doi.org/10.1146/annurev.aa.30.090192.002551',
    },
    {
      text: 'Müller, M., Charypar, D., Gross, M., Particle-based fluid simulation for interactive applications, Proceedings of the 2003 ACM SIGGRAPH/Eurographics Symposium on Computer Animation, 154–159 (2003)',
      href: 'https://doi.org/10.2312/SCA03/154-159',
    },
    {
      text: 'Gingold, R. A., Monaghan, J. J., Smoothed particle hydrodynamics: theory and application to non-spherical stars, Monthly Notices of the Royal Astronomical Society 181, 375–389 (1977)',
      href: 'https://doi.org/10.1093/mnras/181.3.375',
    },
    {
      text: 'Lucy, L. B., A numerical approach to the testing of the fission hypothesis, The Astronomical Journal 82, 1013–1024 (1977)',
      href: 'https://doi.org/10.1086/112164',
    },
  ],
}
