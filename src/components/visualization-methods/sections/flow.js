import { lazy } from 'react'

const PlaceholderSim = lazy(() => import('../sims/PlaceholderSim.jsx'))

export default {
  id: 'flow',
  tabLabel: '流れ',
  title: '流れの可視化',
  intro: '空気や水の流れのように目に見えない速度の場を、矢印・線・粒子・模様で描く。流れはドラッグでかき混ぜられる。',
  overview: {
    Sim: PlaceholderSim,
    caption: '速度の場を複数の方法で描き分ける可視化を準備しています。',
  },
  steps: [],
  combination: null,
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
