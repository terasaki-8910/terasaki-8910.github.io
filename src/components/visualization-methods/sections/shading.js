import { lazy } from 'react'

const PlaceholderSim = lazy(() => import('../sims/PlaceholderSim.jsx'))

export default {
  id: 'shading',
  tabLabel: '反射と影',
  title: '反射モデルと影',
  intro: '光が物の表面で跳ね返る量を、面の向きと、光・目の向きから計算して、画素の色を決める。光源をつかんで動かせる。',
  overview: {
    Sim: PlaceholderSim,
    caption: '光源と面の向きによる反射と影の変化を確かめる可視化を準備しています。',
  },
  steps: [],
  combination: null,
  sources: [
    { text: 'J. H. Lambert, Photometria, 1760' },
    { text: 'B. T. Phong, Illumination for computer generated pictures, Communications of the ACM 18(6), 311–317, 1975' },
    { text: 'J. F. Blinn, Models of light reflection for computer synthesized pictures, SIGGRAPH \'77, 192–198, 1977' },
    { text: 'K. E. Torrance, E. M. Sparrow, Theory for off-specular reflection from roughened surfaces, J. Optical Society of America 57(9), 1105–1114, 1967' },
    { text: 'R. L. Cook, K. E. Torrance, A reflectance model for computer graphics, ACM Transactions on Graphics 1(1), 7–24, 1982' },
    { text: 'P. Beckmann, A. Spizzichino, The Scattering of Electromagnetic Waves from Rough Surfaces, Pergamon, 1963' },
    { text: 'B. Walter, S. R. Marschner, H. Li, K. E. Torrance, Microfacet models for refraction through rough surfaces, EGSR 2007' },
    { text: 'C. Schlick, An inexpensive BRDF model for physically-based rendering, Computer Graphics Forum 13(3), 233–246, 1994' },
    { text: 'H. Gouraud, Continuous shading of curved surfaces, IEEE Transactions on Computers C-20(6), 623–629, 1971' },
    { text: 'J. F. Blinn, M. E. Newell, Texture and reflection in computer generated images, Communications of the ACM 19(10), 542–547, 1976' },
    { text: 'L. Williams, Casting curved shadows on curved surfaces, SIGGRAPH \'78, 270–274, 1978' },
    { text: 'W. Donnelly, A. Lauritzen, Variance shadow maps, I3D 2006, 161–165' },
  ],
}
