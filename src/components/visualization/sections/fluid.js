// 節「流体（SPH）」のデータ。形は sections/index.js を見る。
// 仮の中身(C1)。段階 C2 の (iii) が、説明・式・出典・シミュレーションを書き直す。
export default {
  id: 'fluid',
  title: '流体（SPH）',
  tabLabel: '流体',
  description: '流体を粒子の集まりで表し、まわりの粒子から密度と圧力を求めて動かす。',
  formulas: [
    {
      id: 'pressure',
      caption: '状態方程式',
      tex: 'p = k\\,(\\rho - \\rho_0)',
      symbols: [
        { tex: 'p', meaning: '圧力', unit: '' },
        { tex: '\\rho,\\ \\rho_0', meaning: '密度と、休止密度', unit: '' },
        { tex: 'k', meaning: '圧力の係数（大きいほど縮みにくい）', unit: '' },
      ],
    },
  ],
  snippets: ['sph-computePressure'],
  sources: [{ text: 'Müller, Charypar, Gross, Particle-Based Fluid Simulation for Interactive Applications, SCA (2003)' }],
}
