import { lazy } from 'react'

const PlaceholderSim = lazy(() => import('../sims/PlaceholderSim.jsx'))

export default {
  id: 'shape',
  tabLabel: '形状',
  title: '曲線と曲面',
  intro: '点をいくつか置くと、それをなめらかにつなぐ曲線が決まる。点（制御点）をつかんで動かすと、曲線の決め方による違いが見える。',
  overview: {
    Sim: PlaceholderSim,
    caption: '制御点と曲線・曲面の関係を動かして確かめる可視化を準備しています。',
  },
  steps: [],
  combination: null,
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
