import { lazy } from 'react'

const PlaceholderSim = lazy(() => import('../sims/PlaceholderSim.jsx'))

export default {
  id: 'ct',
  tabLabel: 'CT',
  title: 'CT の再構成と画像の前処理',
  intro: '体の断面を、いろいろな向きから X 線で撮った影（投影）から作り直す。作り直す前後の画像の雑音や形は、フィルタで整える。',
  overview: {
    Sim: PlaceholderSim,
    caption: '投影から断面を再構成し、画像を整える可視化を準備しています。',
  },
  steps: [],
  combination: null,
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
