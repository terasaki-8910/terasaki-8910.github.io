import { lazy } from 'react'

const ShadingSim = lazy(() => import('../sims/shadingSim.jsx'))
const ShadingStep1 = lazy(() => import('../sims/shadingStep1.jsx'))
const ShadingStep2 = lazy(() => import('../sims/shadingStep2.jsx'))
const ShadingStep3 = lazy(() => import('../sims/shadingStep3.jsx'))
const ShadingStep4 = lazy(() => import('../sims/shadingStep4.jsx'))

export default {
  id: 'shading',
  tabLabel: '反射と影',
  title: '反射モデルと影',
  intro: '光が物の表面で跳ね返る量を、面の向きと、光・目の向きから計算して、画素の色を決める。光源をつかんで動かせる。',
  overview: {
    Sim: ShadingSim,
    caption: '太陽印を動かし、反射モデル・陰影・材質・影の設定が球と床の見え方をどう変えるか比べられます。',
  },
  steps: [
    {
      id: 'normal',
      title: '面の向き（法線）',
      text: '三角形の2辺 AB と AC の外積は両方に直角になり、長さを1にすると面の向き n を表せます。頂点を外側から反時計回りに並べると、その側が表になり、周囲の面法線を平均すれば滑らかな頂点法線になります。球をドラッグして回し、三角形を選んで辺の順序と法線の向きを確かめてください。',
      formulas: [
        {
          caption: '面法線',
          tex: 'n = \\frac{(B-A) \\times (C-A)}{\\lvert (B-A) \\times (C-A) \\rvert}',
          symbols: [
            { tex: 'A, B, C', meaning: '三角形の頂点', unit: '\\mathrm{m}' },
            { tex: 'n', meaning: '長さ1の面法線', unit: '' },
          ],
        },
        {
          caption: '頂点法線',
          tex: 'n_v = \\operatorname{normalize}\\left(\\sum_f n_f\\right)',
          symbols: [
            { tex: 'n_v', meaning: '頂点法線', unit: '' },
            { tex: 'n_f', meaning: '頂点に接する面の法線', unit: '' },
          ],
        },
      ],
      snippets: ['shading-faceNormal', 'shading-vertexNormals', 'vec3-cross'],
      Sim: ShadingStep1,
    },
    {
      id: 'lambert',
      title: '光が当たる角度（拡散反射）',
      text: '同じ幅の光は、面へ斜めに当たるほど 1/cos θ 倍の広い範囲へ分かれるので、単位面積の明るさは cos θ 倍になります。この値は目の位置には左右されません。Lをつかんで角度を変え、照射幅・余弦グラフ・球の明暗の境目を見比べてください。',
      formulas: [{
        caption: 'ランバート拡散反射',
        tex: 'I_d = k_d l_d \\max(0, N \\cdot L) = k_d l_d \\cos\\theta',
        symbols: [
          { tex: 'I_d', meaning: '拡散反射の強さ', unit: '' },
          { tex: 'k_d', meaning: '材質の拡散反射率', unit: '' },
          { tex: 'l_d', meaning: '光の強さ', unit: '' },
          { tex: 'N, L', meaning: '法線と光への単位方向', unit: '' },
          { tex: '\\theta', meaning: '法線と光のなす角', unit: '\\mathrm{rad}' },
        ],
      }],
      snippets: ['shading-lambert'],
      Sim: ShadingStep2,
    },
    {
      id: 'phong',
      title: 'つやの光（フォンの鏡面反射）',
      text: '光 L を法線 N に対して鏡映した方向 R に視線 V が近いほど、内積 R・V は1に近づき、つやが明るくなります。指数 m を大きくすると1より小さい値が急に減るため、明るい範囲が狭まります。LとVを動かして分布と球のハイライトを見ながら、環境光・拡散反射・鏡面反射を足すフォンモデルを確かめてください。',
      formulas: [
        {
          caption: '鏡方向',
          tex: 'R = 2(N \\cdot L)N - L',
          symbols: [
            { tex: 'R', meaning: '鏡面反射の単位方向', unit: '' },
            { tex: 'N, L', meaning: '法線と光への単位方向', unit: '' },
          ],
        },
        {
          caption: 'フォンの鏡面反射',
          tex: 'I_s = k_s l_s \\max(0, R \\cdot V)^m',
          symbols: [
            { tex: 'I_s', meaning: '鏡面反射の強さ', unit: '' },
            { tex: 'k_s', meaning: '材質の鏡面反射率', unit: '' },
            { tex: 'l_s', meaning: '光の強さ', unit: '' },
            { tex: 'V', meaning: '目への単位方向', unit: '' },
            { tex: 'm', meaning: '光沢度', unit: '' },
          ],
        },
        {
          caption: 'フォン反射モデル',
          tex: 'I = k_a l_a + I_d + I_s',
          symbols: [
            { tex: 'k_a l_a', meaning: '環境光の成分', unit: '' },
            { tex: 'I', meaning: '合計した明るさ', unit: '' },
          ],
        },
      ],
      snippets: ['shading-reflect', 'shading-phongSpecular'],
      Sim: ShadingStep3,
    },
    {
      id: 'blinn-phong',
      title: 'ハーフベクトル（ブリン-フォン）',
      text: '光 L と視線 V を足して長さを1にした H は、2方向のちょうど中間を向き、H が法線 N に近いほど明るくなります。3方向が同じ平面にあると R–V の角は N–H の角のちょうど2倍なので、同じ広がりには指数をおよそ4倍にします。LとVを動かし、「広がりをそろえる」を切り替えて2本の分布と角度を比べてください。',
      formulas: [
        {
          caption: 'ハーフベクトル',
          tex: 'H = \\frac{L + V}{\\lvert L + V \\rvert}',
          symbols: [
            { tex: 'H', meaning: '光と目の中間の単位方向', unit: '' },
            { tex: 'L, V', meaning: '光と目への単位方向', unit: '' },
          ],
        },
        {
          caption: 'ブリン-フォンの鏡面反射',
          tex: 'I_s = k_s l_s \\max(0, N \\cdot H)^m',
          symbols: [
            { tex: 'I_s', meaning: '鏡面反射の強さ', unit: '' },
            { tex: 'N', meaning: '面の単位法線', unit: '' },
            { tex: 'm', meaning: '光沢度', unit: '' },
          ],
        },
      ],
      snippets: ['shading-halfVector', 'shading-blinnPhongSpecular'],
      Sim: ShadingStep4,
    },
  ],
  combination: {
    text: 'ここまでの4段階では、面の向きから拡散反射を求め、目の方向を加えて2種類のつやを計算します。',
    flow: [
      { steps: [1, 2], text: '三角形から法線を作り、光との角度で拡散反射を決めます。' },
      { steps: [3, 4], text: '光と目の方向から、鏡方向またはハーフベクトルを使ってつやを足します。' },
    ],
  },
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
