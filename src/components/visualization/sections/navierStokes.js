// 節「ナビエ・ストークス方程式（格子）」のデータ。形は sections/index.js を見る。
// 式は utils/vis/grid.js の実装に合わせた形。2 次元は 1 m × 1 m の周期境界の格子、移流と粘性の段階は 1 次元で見せる。
import NsSim from '../sims/NsSim.jsx'
import NsStep1 from '../sims/nsStep1.jsx'
import NsStep2 from '../sims/nsStep2.jsx'
import NsStep3 from '../sims/nsStep3.jsx'
import NsStep4 from '../sims/nsStep4.jsx'
import NsStep5 from '../sims/nsStep5.jsx'

export default {
  id: 'navier-stokes',
  tabLabel: 'NS 方程式',
  title: 'ナビエ・ストークス方程式（格子）',
  intro: '流れを、正方形のマス目（格子）の各マスの速度で表して、ナビエ・ストークス方程式を 2 次元で解く。流体のタブが粒子を動かすのに対して、こちらはマス目を動かさずに、そこを通る流れを追う。まず全体を動かし、そのあと、式の項を 1 つずつ小さなシミュレーションで確かめて、最後に組み合わせる。',
  overview: {
    Sim: NsSim,
    caption: 'ドラッグすると、その向きに流れを押せる（外力）。初めは、逆向きに流れる 2 つの層の境目が巻き上がって渦になる。色は染料と渦度で切り替えられる。項を切ると、その項がないと流れがどう変わるかが見える。',
  },
  steps: [
    {
      id: 'force',
      title: '外力',
      text: '外力は、流れを外から押す力（手でかき混ぜる、扇風機で風を送るなど）。1 kg あたりの力 f は加速度なので、Δt のあいだに速度は f·Δt だけ増える。ここではほかの項を全部切ってあるので、押した分の速度はそのまま残り、押し続けると増え続ける。',
      formulas: [
        {
          id: 'force',
          caption: '外力だけのとき（1 kg あたりの力 f は加速度）',
          tex: String.raw`\frac{\partial \mathbf{u}}{\partial t} = \mathbf{f} \quad\Longrightarrow\quad \mathbf{u}^{*} = \mathbf{u}^{n} + \Delta t\,\mathbf{f}`,
          symbols: [
            { tex: '\\mathbf{u} = (u,\\ v)', meaning: '各マスの速度（x 向きと y 向き）', unit: '\\mathrm{m/s}' },
            { tex: '\\mathbf{f}', meaning: '1 kg あたりの外力（加速度）', unit: '\\mathrm{m/s^2}' },
            { tex: '\\Delta t', meaning: '1 ステップの時間', unit: '\\mathrm{s}' },
            { tex: '\\mathbf{u}^{n},\\ \\mathbf{u}^{*}', meaning: '今の速度と、外力を足したあとの速度', unit: '\\mathrm{m/s}' },
          ],
        },
        {
          id: 'splat',
          caption: '押した点のまわりにだけ力をかける（近いほど強く、距離が r の 2 倍を超えるとほぼ 0）',
          tex: String.raw`\mathbf{f}(\mathbf{x}) = \mathbf{F}\,\exp\!\left(-\frac{\lvert \mathbf{x}-\mathbf{x}_p\rvert^{2}}{r^{2}}\right)`,
          symbols: [
            { tex: '\\mathbf{F}', meaning: '押した点での力（向きはドラッグの向き）', unit: '\\mathrm{m/s^2}' },
            { tex: '\\mathbf{x}_p', meaning: '押した点', unit: '\\mathrm{m}' },
            { tex: 'r', meaning: '力が届く広さ', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['grid-addSplat2D'],
      Sim: NsStep1,
    },
    {
      id: 'advection',
      title: '移流（流れに運ばれる）',
      text: '流れは、染料も速度そのものも運ぶ。マス目は動かないので、新しい値は「Δt 前にはどこにあったか」を流れと逆向きにさかのぼり、そこの値を持ってくる（マスとマスのあいだなら、両側の値を距離で比例配分する）。1 次元で、一定の速さ c で流れる山を見る。隣のマスとの差を使う風上差分は 1 ステップに 1 マスより多く進むと発散するが、さかのぼる方法は発散しない。そのかわり、比例配分のたびに山が少しなまる。',
      formulas: [
        {
          id: 'advection-1d',
          caption: '1 次元の移流と、さかのぼる方法（セミラグランジュ法）',
          tex: String.raw`\frac{\partial \phi}{\partial t} + c\,\frac{\partial \phi}{\partial x} = 0 \quad\Longrightarrow\quad \phi^{n+1}(x_i) = \phi^{n}(x_i - c\,\Delta t)`,
          symbols: [
            { tex: '\\phi', meaning: '運ばれる量（染料の濃さなど）', unit: '' },
            { tex: 'c', meaning: '流れの速さ', unit: '\\mathrm{m/s}' },
            { tex: 'x_i', meaning: 'マス i の中心', unit: '\\mathrm{m}' },
          ],
        },
        {
          id: 'upwind',
          caption: '比べる方法：風上差分（流れの来る側との差を使う。c > 0 のとき）と、その安定の条件',
          tex: String.raw`\phi_i^{n+1} = \phi_i^{n} - \frac{c\,\Delta t}{\Delta x}\bigl(\phi_i^{n} - \phi_{i-1}^{n}\bigr),\qquad \frac{\lvert c\rvert\,\Delta t}{\Delta x} \le 1`,
          symbols: [
            { tex: '\\Delta x', meaning: 'マスの幅', unit: '\\mathrm{m}' },
            { tex: '\\lvert c\\rvert\\,\\Delta t/\\Delta x', meaning: 'クーラン数（1 ステップに進むマスの数）', unit: '' },
          ],
        },
        {
          id: 'advection-2d',
          caption: '2 次元では、速度 u が自分自身を運ぶ（全体のシミュレーションの移流）',
          tex: String.raw`\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u}\cdot\nabla)\,\mathbf{u} = 0 \quad\Longrightarrow\quad \mathbf{u}^{n+1}(\mathbf{x}) = \mathbf{u}^{n}\bigl(\mathbf{x} - \Delta t\,\mathbf{u}^{n}(\mathbf{x})\bigr)`,
          symbols: [
            { tex: '(\\mathbf{u}\\cdot\\nabla)\\,\\mathbf{u}', meaning: '移流項（速度が、自分の速度で運ばれる分）', unit: '\\mathrm{m/s^2}' },
          ],
        },
      ],
      snippets: ['grid-advectSemiLagrangian1D', 'grid-advectUpwind1D', 'grid-advectSemiLagrangian2D'],
      Sim: NsStep2,
    },
    {
      id: 'viscosity',
      title: '粘性（となりとならす）',
      text: '粘性は、となりどうしの速度の差をならす働きで、はちみつは大きく、水は小さい。ν ∂²u/∂x² をマス目で書くと「両隣の平均と自分との差」に比例するので、速いマスは遅く、遅いマスは速くなって、速度の分布がなだらかになる（全部の和は変わらない）。1 ステップでならしすぎる（νΔt/Δx² が 1/2 を超える）と、ぎざぎざが増えて発散する。',
      formulas: [
        {
          id: 'diffusion',
          caption: '粘性だけのとき（1 次元）と、マス目での書き方',
          tex: String.raw`\frac{\partial u}{\partial t} = \nu\,\frac{\partial^{2} u}{\partial x^{2}} \quad\Longrightarrow\quad u_i^{n+1} = u_i^{n} + 2a\left(\frac{u_{i+1}^{n} + u_{i-1}^{n}}{2} - u_i^{n}\right),\quad a = \frac{\nu\,\Delta t}{\Delta x^{2}}`,
          symbols: [
            { tex: 'u_i', meaning: 'マス i の速さ', unit: '\\mathrm{m/s}' },
            { tex: '\\nu', meaning: '動粘性係数（水は約 1×10⁻⁶）', unit: '\\mathrm{m^2/s}' },
            { tex: 'a', meaning: '1 ステップでならす割合', unit: '' },
          ],
        },
        {
          id: 'stability',
          caption: '安定の条件（2 次元では隣が 4 つあるので 1/4）',
          tex: String.raw`\frac{\nu\,\Delta t}{\Delta x^{2}} \le \frac{1}{2}\ \ (1\ \text{次元}),\qquad \frac{\nu\,\Delta t}{\Delta x^{2}} \le \frac{1}{4}\ \ (2\ \text{次元})`,
        },
        {
          id: 'viscosity-2d',
          caption: '2 次元の粘性項（全体のシミュレーションでは、u と v のそれぞれにかける）',
          tex: String.raw`\nu\,\nabla^{2}\mathbf{u} = \nu\left(\frac{\partial^{2}\mathbf{u}}{\partial x^{2}} + \frac{\partial^{2}\mathbf{u}}{\partial y^{2}}\right)`,
        },
      ],
      snippets: ['grid-diffuse1D', 'grid-diffuse2D'],
      Sim: NsStep3,
    },
    {
      id: 'pressure',
      title: '圧力（縮まないようにする）',
      text: '水はほとんど縮まないので、どの小さな四角でも「流れ込む量 = 流れ出る量」、つまり発散 ∇·u が 0 でなければならない。外力や移流のあとの速度は、この条件を少し破っている。そこで、流れ込みすぎた所の圧力を上げ、圧力の高い所から低い所へ押し戻して速度を直す。どれだけ押し戻すかはポアソン方程式を解いて決める（ガウス・ザイデル法で、くり返すほど発散が 0 に近づく）。',
      formulas: [
        {
          id: 'divergence',
          caption: '発散（その点から湧き出す量。正なら湧き出し、負なら吸い込み）と、縮まない条件',
          tex: String.raw`\nabla\cdot\mathbf{u} = \frac{\partial u}{\partial x} + \frac{\partial v}{\partial y} = 0`,
          symbols: [
            { tex: 'u,\\ v', meaning: '速度の x 成分と y 成分', unit: '\\mathrm{m/s}' },
            { tex: '\\nabla\\cdot\\mathbf{u}', meaning: '発散', unit: '\\mathrm{s^{-1}}' },
          ],
        },
        {
          id: 'projection',
          caption: '圧力で速度を直す（射影）。p はポアソン方程式で決める',
          tex: String.raw`\nabla^{2} p = \frac{\rho}{\Delta t}\,\nabla\cdot\mathbf{u}^{*},\qquad \mathbf{u}^{n+1} = \mathbf{u}^{*} - \frac{\Delta t}{\rho}\,\nabla p`,
          symbols: [
            { tex: 'p', meaning: '圧力', unit: '\\mathrm{Pa}' },
            { tex: '\\rho', meaning: '密度', unit: '\\mathrm{kg/m^3}' },
            { tex: '\\mathbf{u}^{*}', meaning: '圧力で直す前の速度', unit: '\\mathrm{m/s}' },
            { tex: '\\nabla p', meaning: '圧力の勾配（圧力の高い方を向く）', unit: '\\mathrm{Pa/m}' },
          ],
        },
        {
          id: 'gauss-seidel',
          caption: 'ガウス・ザイデル法の 1 回（q = Δt·p/ρ。∇·u と同じ中心差分を 2 回かけた形なので、2 マス離れた点を使う）',
          tex: String.raw`q_{i,j} \leftarrow \frac{1}{4}\Bigl(q_{i-2,j} + q_{i+2,j} + q_{i,j-2} + q_{i,j+2} - 4\,\Delta x^{2}\,(\nabla\cdot\mathbf{u}^{*})_{i,j}\Bigr)`,
          symbols: [{ tex: 'q', meaning: 'Δt·p/ρ（解きやすいようにまとめた量）', unit: '\\mathrm{m^2/s}' }],
        },
      ],
      snippets: ['grid-divergence2D', 'grid-projectPeriodic2D'],
      Sim: NsStep4,
    },
    {
      id: 'time-step',
      title: '時間変化（項を分けて順に進める）',
      text: '左辺の ∂u/∂t は、Δt のあいだの速度の変化を Δt で割ったもの。右辺の項を全部いっしょに計算するかわりに、外力 → 移流 → 粘性 → 圧力の順に 1 つずつ速度に効かせて、Δt 後の速度にする（分割法）。項を分けると、移流はさかのぼり、圧力はポアソン方程式と、それぞれに合った解き方を使える。「1 段進める」で、1 つの項が速度をどれだけ変えたかを矢印で見られる。',
      formulas: [
        {
          id: 'navier-stokes',
          caption: '非圧縮のナビエ・ストークス方程式（1 kg あたりの形）',
          tex: String.raw`\underbrace{\frac{\partial \mathbf{u}}{\partial t}}_{\text{時間変化}} + \underbrace{(\mathbf{u}\cdot\nabla)\,\mathbf{u}}_{\text{移流}} = \underbrace{-\frac{1}{\rho}\nabla p}_{\text{圧力}} + \underbrace{\nu\,\nabla^{2}\mathbf{u}}_{\text{粘性}} + \underbrace{\mathbf{f}}_{\text{外力}},\qquad \nabla\cdot\mathbf{u} = 0`,
          symbols: [
            { tex: '\\mathbf{u}', meaning: '速度', unit: '\\mathrm{m/s}' },
            { tex: 'p,\\ \\rho', meaning: '圧力と密度', unit: '\\mathrm{Pa},\\ \\mathrm{kg/m^3}' },
            { tex: '\\nu', meaning: '動粘性係数', unit: '\\mathrm{m^2/s}' },
            { tex: '\\mathbf{f}', meaning: '1 kg あたりの外力', unit: '\\mathrm{m/s^2}' },
          ],
        },
        {
          id: 'time-derivative',
          caption: '時間変化を差分で書く（前進差分）',
          tex: String.raw`\frac{\partial \mathbf{u}}{\partial t} \approx \frac{\mathbf{u}^{n+1} - \mathbf{u}^{n}}{\Delta t}`,
        },
        {
          id: 'splitting',
          caption: '1 ステップを項ごとに分けて、順に進める',
          tex: String.raw`\mathbf{u}^{n} \xrightarrow{\ \text{外力}\ } \mathbf{u}^{(1)} \xrightarrow{\ \text{移流}\ } \mathbf{u}^{(2)} \xrightarrow{\ \text{粘性}\ } \mathbf{u}^{(3)} \xrightarrow{\ \text{圧力}\ } \mathbf{u}^{n+1}`,
        },
      ],
      snippets: ['grid-fluidSubstep2D', 'grid-fluidStep2D'],
      Sim: NsStep5,
    },
  ],
  combination: {
    text: '全体のシミュレーションは、次の順を 1 ステップとして、Δt = 1/60 s ずつ時間を進めている（段階 5）。',
    flow: [
      { steps: [1], text: 'ドラッグした所の速度を、押した向きに増やす（染料も足す）' },
      { steps: [2], text: '速度と染料を、Δt 前の位置からさかのぼって運ぶ' },
      { steps: [3], text: '速度を両隣の平均に近づけて、なだらかにする' },
      { steps: [4], text: '圧力を解いて、発散が 0 になるように速度を直す' },
      { steps: [5], text: 'これを Δt ごとにくり返す' },
    ],
  },
  sources: [
    { text: 'Stam, J., Stable fluids, Proceedings of SIGGRAPH 99, 121–128 (1999)', href: 'https://doi.org/10.1145/311535.311548' },
    { text: 'Chorin, A. J., Numerical solution of the Navier–Stokes equations, Mathematics of Computation 22, 745–762 (1968)', href: 'https://doi.org/10.1090/S0025-5718-1968-0242392-2' },
    {
      text: 'Courant, R., Friedrichs, K., Lewy, H., Über die partiellen Differenzengleichungen der mathematischen Physik, Mathematische Annalen 100, 32–74 (1928)',
      href: 'https://doi.org/10.1007/BF01448839',
    },
    { text: 'Bridson, R., Fluid Simulation for Computer Graphics, 2nd ed., CRC Press (2015)' },
  ],
}
