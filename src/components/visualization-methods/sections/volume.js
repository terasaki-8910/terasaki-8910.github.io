import { lazy } from 'react'

const PlaceholderSim = lazy(() => import('../sims/PlaceholderSim.jsx'))

export default {
  id: 'volume',
  tabLabel: 'ボリューム',
  title: 'ボリュームレンダリング',
  intro: '空間のすべての点に値があるデータ（CT の値や煙の濃さ）を、光が通り抜けながら弱まり、光る様子として描く。回して見られる。',
  overview: {
    Sim: PlaceholderSim,
    caption: '空間を通る光から体積データを描く可視化を準備しています。',
  },
  steps: [],
  combination: null,
  sources: [
    { text: 'J. T. Kajiya, B. P. Von Herzen, Ray tracing volume densities, SIGGRAPH \'84, 165–174, 1984' },
    { text: 'M. Levoy, Display of surfaces from volume data, IEEE CG&A 8(3), 29–37, 1988' },
    { text: 'R. A. Drebin, L. Carpenter, P. Hanrahan, Volume rendering, SIGGRAPH \'88, 65–74, 1988' },
    { text: 'N. Max, Optical models for direct volume rendering, IEEE TVCG 1(2), 99–108, 1995' },
    { text: 'B. Cabral, N. Cam, J. Foran, Accelerated volume rendering and tomographic reconstruction using texture mapping hardware, VolVis 1994, 91–98' },
    { text: 'K. Engel et al., Real-Time Volume Graphics, A K Peters, 2006' },
    { text: 'L. A. Shepp, B. F. Logan, The Fourier reconstruction of a head section, IEEE Transactions on Nuclear Science 21(3), 21–43, 1974' },
  ],
}
