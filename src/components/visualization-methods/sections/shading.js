import { lazy } from 'react'

const ShadingSim = lazy(() => import('../sims/shadingSim.jsx'))
const ShadingStep1 = lazy(() => import('../sims/shadingStep1.jsx'))
const ShadingStep2 = lazy(() => import('../sims/shadingStep2.jsx'))
const ShadingStep3 = lazy(() => import('../sims/shadingStep3.jsx'))
const ShadingStep4 = lazy(() => import('../sims/shadingStep4.jsx'))
const ShadingStep5 = lazy(() => import('../sims/shadingStep5.jsx'))
const ShadingStep6 = lazy(() => import('../sims/shadingStep6.jsx'))
const ShadingStep7 = lazy(() => import('../sims/shadingStep7.jsx'))
const ShadingStep8 = lazy(() => import('../sims/shadingStep8.jsx'))

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
    {
      id: 'cook-torrance',
      title: '小さな面の集まり（クック-トランス）',
      text: '表面を向きの異なる小さな鏡の集まりと考え、光と目の中間 H を向く面の割合 D、途中で遮られない割合 G、反射する割合 F を掛けます。粗さ m が大きいほど小さな面の傾きが広く散り、つやは広く弱くなります。L と V をつかみ、光を目へ返す微小面と、右の D・G・F・合成したつやの変化を見てください。この D は半球全体で足すと1になる形で、文献によって定数の置き方が異なります。',
      formulas: [
        {
          caption: 'クック-トランスの鏡面反射',
          tex: 'R_s = \\frac{DGF}{4(N \\cdot L)(N \\cdot V)}',
          symbols: [
            { tex: 'D', meaning: 'H を向く微小面の分布', unit: '' },
            { tex: 'G', meaning: '光路が遮られない割合', unit: '' },
            { tex: 'F', meaning: '表面で反射する割合', unit: '' },
          ],
        },
        {
          caption: 'Beckmann 分布',
          tex: 'D(\\alpha) = \\frac{\\exp(-\\tan^2\\alpha/m^2)}{\\pi m^2\\cos^4\\alpha},\\quad \\alpha = \\arccos(N \\cdot H)',
          symbols: [
            { tex: '\\alpha', meaning: '法線と H のなす角', unit: '\\mathrm{rad}' },
            { tex: 'm', meaning: '粗さ', unit: '' },
          ],
        },
        {
          caption: '幾何減衰とフレネル項',
          tex: 'G = \\min\\!\\left(1, \\frac{2(N\\cdot H)(N\\cdot V)}{V\\cdot H}, \\frac{2(N\\cdot H)(N\\cdot L)}{V\\cdot H}\\right),\\quad F \\approx F_0 + (1-F_0)(1-V\\cdot H)^5',
          symbols: [
            { tex: 'F_0', meaning: '正面から見た反射率', unit: '' },
            { tex: 'N,L,V,H', meaning: '法線・光・目・中間の単位方向', unit: '' },
          ],
        },
      ],
      snippets: ['shading-beckmannD', 'shading-geometryG', 'shading-fresnelSchlick', 'shading-cookTorranceSpecular'],
      Sim: ShadingStep5,
    },
    {
      id: 'smooth-shading',
      title: '面の中の色（グロー／フォンシェーディング）',
      text: '三角形の頂点でだけ色を計算し、重み λ で面の中へ混ぜるのがグローシェーディングです。計算は速い一方、頂点にない中央のつやは消えます。フォンシェーディングは法線を混ぜて長さを1に戻し、各画素で光を計算するため中央のつやも残ります。光と面内の点をつかみ、左右の明るさと λ0・λ1・λ2 を比べてください。',
      formulas: [
        {
          caption: '重心座標',
          tex: 'p = \\lambda_0 v_0 + \\lambda_1 v_1 + \\lambda_2 v_2,\\quad \\lambda_0 + \\lambda_1 + \\lambda_2 = 1',
          symbols: [
            { tex: 'p', meaning: '三角形の中の点', unit: '' },
            { tex: '\\lambda_i', meaning: '各頂点の重み', unit: '' },
          ],
        },
        {
          caption: '色と法線の補間',
          tex: 'c(p) = \\sum_i \\lambda_i c_i,\\qquad n(p) = \\operatorname{normalize}\\!\\left(\\sum_i \\lambda_i n_i\\right)',
          symbols: [
            { tex: 'c_i', meaning: '頂点で計算した色', unit: '' },
            { tex: 'n_i', meaning: '頂点法線', unit: '' },
          ],
        },
      ],
      snippets: ['raster-barycentric', 'raster-rasterTriangle'],
      Sim: ShadingStep6,
    },
    {
      id: 'refraction',
      title: '曲がる光と映り込み（スネルの法則）',
      text: '屈折率の異なる境界では、入射角 θ と屈折角 φ が η1 sin θ = η2 sin φ になる向きへ光が曲がります。密な側から浅い角度で出ると屈折する向きがなくなり、光はすべて反射します。入射光をつかみ、屈折率を変えて反射・屈折の角度と全反射を確かめてください。映り込みやガラスは、この向きで遠くの背景画像から色を取ります。',
      formulas: [
        {
          caption: 'スネルの法則',
          tex: '\\eta_1\\sin\\theta = \\eta_2\\sin\\phi',
          symbols: [
            { tex: '\\eta_1,\\eta_2', meaning: '上側と下側の屈折率', unit: '' },
            { tex: '\\theta,\\phi', meaning: '入射角と屈折角', unit: '\\mathrm{rad}' },
          ],
        },
        {
          caption: '反射と屈折の向き',
          tex: 'R = I - 2(N\\cdot I)N,\\qquad T = \\eta I + (\\eta\\cos\\theta-\\cos\\phi)N,\\quad \\eta=\\eta_1/\\eta_2',
          symbols: [
            { tex: 'I,R,T', meaning: '入射・反射・屈折の単位方向', unit: '' },
            { tex: 'N', meaning: '入射側を向く単位法線', unit: '' },
          ],
        },
      ],
      snippets: ['shading-reflectIncident', 'shading-refract'],
      Sim: ShadingStep7,
    },
    {
      id: 'shadow-map',
      title: '影（シャドウマップ）',
      text: '光源から方向ごとに最初の物体までの距離 dL を表へ記録し、カメラに見える点の距離 dC がそれより遠ければ、間に物体があるので影にします。表が粗いと影の縁はぎざぎざになり、ずらし ε が小さすぎると同じ面を誤って遮蔽物とみなす斑点が出ます。光源と箱をつかみ、光線数・ε・やわらかい影を変えて床と距離表を見比べてください。',
      formulas: [
        {
          caption: '影の判定',
          tex: '\\text{影} \\iff d_C > d_L + \\varepsilon',
          symbols: [
            { tex: 'd_C', meaning: '調べる点までの距離', unit: '\\mathrm{m}' },
            { tex: 'd_L', meaning: '表に記録した最短距離', unit: '\\mathrm{m}' },
            { tex: '\\varepsilon', meaning: '自己遮蔽を避けるずらし', unit: '\\mathrm{m}' },
          ],
        },
        {
          caption: 'VSM の明るさ上限',
          tex: 'P(d \\ge d_C) \\le \\frac{\\sigma^2}{\\sigma^2 + (d_C-\\mu)^2},\\quad \\mu=E[d],\\quad \\sigma^2=E[d^2]-\\mu^2',
          symbols: [
            { tex: '\\mu', meaning: '近くの距離の平均', unit: '\\mathrm{m}' },
            { tex: '\\sigma^2', meaning: '近くの距離の分散', unit: '\\mathrm{m}^2' },
          ],
        },
      ],
      snippets: ['shading-inShadow', 'shading-chebyshevUpperBound'],
      Sim: ShadingStep8,
    },
  ],
  combination: {
    text: '全体の 1 枚の絵は、画素ごとに次の計算をして色を決めている。',
    flow: [
      { steps: [1], text: '面と頂点の法線を求める' },
      { steps: [2], text: '光の当たる角で明るさ（拡散）' },
      { steps: [3, 4, 5], text: 'つやの光（鏡面）を、選んだモデルで足す' },
      { steps: [6], text: '面の中は色か法線を混ぜる' },
      { steps: [7], text: '映り込みとガラスは、反射・屈折の向きで背景の色を取る' },
      { steps: [8], text: '光源から見えない点は光の分を引いて影にする' },
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
