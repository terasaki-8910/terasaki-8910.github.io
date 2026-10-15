// 節「流体（SPH）」のデータ。形は sections/index.js を見る。
// 式は utils/vis/sph.js の実装に合わせた形（2 次元）。単位は 2 次元（奥行き 1 の薄い板）で数えたもの。
import FluidSim from '../sims/FluidSim.jsx'

export default {
  id: 'fluid',
  title: '流体（SPH）',
  tabLabel: '流体',
  description:
    '流体を粒子の集まりで表し、まわりの粒子の値を核で重み付けして足すことで、密度や力を求める。ここでは、積んだ水の塊が崩れて広がるようすを 2 次元で動かす。影響が届くのは近くの粒子だけなので、粒子を一辺 h のグリッドに振り分けてから、近くだけを調べる。ドラッグすると近くの粒子を押せる。',
  formulas: [
    {
      id: 'approximation',
      caption: 'SPH の近似と勾配',
      tex: String.raw`\begin{aligned}
A(\mathbf{x}) &\approx \sum_j \frac{m_j}{\rho_j}\,A_j\,W\bigl(\lvert\mathbf{x}-\mathbf{x}_j\rvert,\,h\bigr) \\
\nabla A(\mathbf{x}) &\approx \sum_j \frac{m_j}{\rho_j}\,A_j\,\nabla W\bigl(\lvert\mathbf{x}-\mathbf{x}_j\rvert,\,h\bigr)
\end{aligned}`,
      symbols: [
        { tex: 'A,\\ A_j', meaning: '場の量（密度や速度など）と、粒子 j が持つ値', unit: '' },
        { tex: '\\mathbf{x},\\ \\mathbf{x}_j', meaning: '値を求める位置と、粒子 j の位置', unit: '\\mathrm{m}' },
        { tex: 'm_j,\\ \\rho_j', meaning: '粒子 j の質量と密度', unit: '\\mathrm{kg},\\ \\mathrm{kg/m^2}' },
        { tex: 'm_j/\\rho_j', meaning: '粒子 j が占める面積', unit: '\\mathrm{m^2}' },
        { tex: 'W', meaning: '核。近いほど大きく、距離が h 以上で 0 になる重み（面積分が 1）', unit: '\\mathrm{m^{-2}}' },
        { tex: 'h', meaning: '影響半径', unit: '\\mathrm{m}' },
      ],
    },
    {
      id: 'density',
      caption: '密度（和）',
      tex: String.raw`\rho_i = \sum_j m\,W_{\mathrm{poly6}}\bigl(\lvert\mathbf{x}_i-\mathbf{x}_j\rvert,\,h\bigr)`,
      symbols: [
        { tex: '\\rho_i', meaning: '粒子 i の密度（j は i 自身も含む）', unit: '\\mathrm{kg/m^2}' },
        { tex: 'm', meaning: '粒子 1 個の質量（全部同じ）', unit: '\\mathrm{kg}' },
        { tex: 'W_{\\mathrm{poly6}}', meaning: '密度用の核', unit: '\\mathrm{m^{-2}}' },
      ],
    },
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
    {
      id: 'pressure-force',
      caption: '圧力の力（対称な形）',
      tex: String.raw`\mathbf{F}_i^{\mathrm{press}} = -\sum_j m^2\left(\frac{p_i}{\rho_i^{2}}+\frac{p_j}{\rho_j^{2}}\right)\nabla W_{\mathrm{spiky}}\bigl(\mathbf{x}_i-\mathbf{x}_j,\,h\bigr)`,
      symbols: [
        { tex: '\\mathbf{F}_i^{\\mathrm{press}}', meaning: '粒子 i が圧力から受ける力（組 (i, j) の力は逆向きで同じ大きさ）', unit: '\\mathrm{N}' },
        { tex: '\\nabla W_{\\mathrm{spiky}}', meaning: '圧力用の核の勾配（中心でも 0 にならない）', unit: '\\mathrm{m^{-3}}' },
      ],
    },
    {
      id: 'viscosity-force',
      caption: '粘性の力',
      tex: String.raw`\mathbf{F}_i^{\mathrm{visc}} = \mu \sum_j m^2\,\frac{\mathbf{v}_j-\mathbf{v}_i}{\rho_i\,\rho_j}\,\nabla^{2} W_{\mathrm{visc}}\bigl(\lvert\mathbf{x}_i-\mathbf{x}_j\rvert,\,h\bigr)`,
      symbols: [
        { tex: '\\mu', meaning: '粘性係数', unit: '\\mathrm{kg/s}' },
        { tex: '\\mathbf{v}_i,\\ \\mathbf{v}_j', meaning: '粒子の速度', unit: '\\mathrm{m/s}' },
        { tex: '\\nabla^{2} W_{\\mathrm{visc}}', meaning: '粘性用の核のラプラシアン', unit: '\\mathrm{m^{-4}}' },
      ],
    },
    {
      id: 'kernels',
      caption: '核（2 次元用の係数。3 次元の定数はそのままでは使えない）',
      tex: String.raw`\begin{aligned}
W_{\mathrm{poly6}}(r,h) &= \frac{4}{\pi h^{8}}\,(h^{2}-r^{2})^{3} \\
\nabla W_{\mathrm{spiky}}(\mathbf{r},h) &= -\frac{30}{\pi h^{5}}\,(h-r)^{2}\,\frac{\mathbf{r}}{r} \\
\nabla^{2} W_{\mathrm{visc}}(r,h) &= \frac{40}{\pi h^{5}}\,(h-r)
\end{aligned}`,
      symbols: [
        { tex: '\\mathbf{r},\\ r', meaning: '粒子 i から見た粒子 j の相対位置 x_i − x_j と、その長さ（r ≥ h では 0）', unit: '\\mathrm{m}' },
        { tex: 'h', meaning: '影響半径', unit: '\\mathrm{m}' },
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
  snippets: [
    'sph-poly6',
    'sph-spikyGrad',
    'sph-viscLaplacian',
    'sph-UniformGrid',
    'sph-findPairs',
    'sph-computeDensity',
    'sph-computePressure',
    'sph-computeForces',
    'sph-sphStep',
  ],
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
  Sim: FluidSim,
}
