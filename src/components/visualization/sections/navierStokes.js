import NsSim from '../sims/NsSim.jsx'

export default {
  id: 'navier-stokes',
  tabLabel: 'NS 方程式',
  title: 'ナビエ・ストークス方程式（格子）',
  intro: '流れを、正方形のマス目（格子）の各マスの速度で表して、ナビエ・ストークス方程式を 2 次元で解く。流体のタブが粒子を動かすのに対して、こちらはマス目を動かさずに、そこを通る流れを追う。まず全体を動かし、そのあと、式の項を 1 つずつ小さなシミュレーションで確かめて、最後に組み合わせる。',
  overview: {
    Sim: NsSim,
    caption: 'ドラッグすると、その向きに流れを押せる（外力）。初めは、逆向きに流れる 2 つの層の境目が巻き上がって渦になる。色は染料と渦度で切り替えられる。項を切ると、その項がないと流れがどう変わるかが見える。',
  },
  steps: [],
  combination: null,
  sources: [
    { text: 'Stam, J., Stable fluids, Proceedings of SIGGRAPH 99, 121–128 (1999)', href: 'https://doi.org/10.1145/311535.311548' },
    { text: 'Chorin, A. J., Numerical solution of the Navier–Stokes equations, Mathematics of Computation 22, 745–762 (1968)', href: 'https://doi.org/10.1090/S0025-5718-1968-0242392-2' },
    { text: 'Bridson, R., Fluid Simulation for Computer Graphics, 2nd ed., CRC Press (2015)' },
  ],
}
