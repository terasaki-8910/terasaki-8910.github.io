import { lazy } from 'react'

const VolumeSim = lazy(() => import('../sims/volumeSim.jsx'))
const VolumeStep1 = lazy(() => import('../sims/volumeStep1.jsx'))
const VolumeStep2 = lazy(() => import('../sims/volumeStep2.jsx'))
const VolumeStep3 = lazy(() => import('../sims/volumeStep3.jsx'))
const VolumeStep4 = lazy(() => import('../sims/volumeStep4.jsx'))
const VolumeStep5 = lazy(() => import('../sims/volumeStep5.jsx'))
const VolumeStep6 = lazy(() => import('../sims/volumeStep6.jsx'))

export default {
  id: 'volume',
  tabLabel: 'ボリューム',
  title: 'ボリュームレンダリング',
  intro: '空間のすべての点に値があるデータ（CT の値や煙の濃さ）を、光が通り抜けながら弱まり、光る様子として描く。回して見られる。',
  overview: {
    Sim: VolumeSim,
    caption: '画像を回し、伝達関数と標本間隔を変えると、同じ体積データから見える構造と計算量が変わります。',
  },
  steps: [
    {
      id: 'absorption',
      title: '光が弱まる（吸収）',
      text: '煙の中では、光は進むたびにその場所の量 σ と今の明るさに比例して少しずつ弱まります。同じ厚さ・同じ σ の区間は毎回同じ割合を取り除くため、明るさは指数関数の形で下がります。三つの区間の丸を動かし、区間を移しても出口の透過率がどう保たれるかを見てください。',
      formulas: [
        { caption: '吸収による変化', tex: '\\frac{dI}{ds}=-\\sigma(s)I(s)', symbols: [{ tex: 'I', meaning: '光の強さ', unit: '' }, { tex: '\\sigma', meaning: '吸収の大きさ', unit: '\\mathrm{length}^{-1}' }] },
        { caption: '区間を通った光', tex: 'I(s)=I_0\\exp\\left(-\\int_0^s\\sigma(t)\\,dt\\right)', symbols: [{ tex: 'I_0', meaning: '入口の光の強さ', unit: '' }, { tex: 's', meaning: '進んだ距離', unit: '\\mathrm{length}' }] },
      ],
      snippets: ['volume-transmittance'],
      Sim: VolumeStep1,
    },
    {
      id: 'emission-absorption',
      title: '光りながら弱まる（発光と吸収）',
      text: '光る煙では、各点が出した光に、その点から目までの煙を通り抜ける割合を掛けて足します。すべての点の分と、煙で暗くなった背景光を合計したものが画素の明るさです。二種類の丸を動かして各点の寄与を比べると、散乱で光の向きが変わる場合にはさらに別の項が必要なことも分かります。',
      formulas: [
        { caption: '発光と背景光', tex: 'L=\\int_0^s\\tau(x,x^{\\prime})\\,\\sigma_a(x^{\\prime})L_e(x^{\\prime})\\,dx^{\\prime}+\\tau(x,x_0)L_0,\\quad \\tau(x,x^{\\prime})=\\exp\\left[-\\int(\\sigma_a+\\sigma_s)\\,dt\\right]', symbols: [{ tex: 'L_e', meaning: 'その点が出す光', unit: '' }, { tex: '\\sigma_a', meaning: '吸収係数', unit: '\\mathrm{length}^{-1}' }, { tex: '\\tau', meaning: '二点間の透過率', unit: '' }] },
        { caption: '散乱で加わる光', tex: '\\int\\tau\\,\\sigma_s\\int_{4\\pi}p(x^{\\prime},\\omega^{\\prime},\\omega)L_i(x^{\\prime},\\omega^{\\prime})\\,d\\omega^{\\prime}\\,dx^{\\prime}', symbols: [{ tex: '\\sigma_s', meaning: '散乱係数', unit: '\\mathrm{length}^{-1}' }, { tex: 'p', meaning: '光が向きを変える割合', unit: '' }, { tex: 'L_i', meaning: '入射する光', unit: '' }] },
      ],
      snippets: ['volume-emissionAbsorption'],
      Sim: VolumeStep2,
    },
    {
      id: 'compositing',
      title: '区切って足す（前から順の合成）',
      text: '一つの区間が光を遮る割合は α = 1 − exp(−σΔs) です。手前からは、まだ見えている割合 1 − A を各色に掛けて足していきます。棒を上下に動かし、A がほぼ 1 になると停止線より後ろの標本が結果に影響しないことを確かめてください。',
      formulas: [
        { caption: '区間の不透明度', tex: '\\alpha_i=1-e^{-\\sigma_i\\Delta s}', symbols: [{ tex: '\\alpha_i', meaning: '区間 i の不透明度', unit: '' }, { tex: '\\Delta s', meaning: '区間の厚さ', unit: '\\mathrm{length}' }] },
        { caption: '前から順の合成', tex: 'C\\leftarrow C+(1-A)\\alpha_i c_i,\\quad A\\leftarrow A+(1-A)\\alpha_i', symbols: [{ tex: 'C', meaning: '積み上げた色', unit: '' }, { tex: 'A', meaning: '積み上げた不透明度', unit: '' }] },
        { caption: '後ろから順の合成', tex: 'C\\leftarrow\\alpha_i c_i+(1-\\alpha_i)C', symbols: [{ tex: 'c_i', meaning: '区間 i の色', unit: '' }] },
      ],
      snippets: ['volume-alphaFromSigma', 'volume-compositeFrontToBack', 'volume-compositeBackToFront'],
      Sim: VolumeStep3,
    },
    {
      id: 'transfer-function',
      title: '値を色と不透明度に（伝達関数）',
      text: '体積データの数値そのものには色がないため、各値に色と不透明度を対応させる表を作ります。骨に近い値だけを不透明にすれば骨が見え、低い値も少し残せば内部が透けて見えます。曲線の点を動かすかプリセットを選び、同じ断面の見え方を比べてください。',
      formulas: [{ caption: '伝達関数', tex: '(c(f),\\alpha(f))=\\mathrm{TF}(f)', symbols: [{ tex: 'f', meaning: '体積データの値', unit: '' }, { tex: 'c', meaning: '割り当てる色', unit: '' }, { tex: '\\alpha', meaning: '割り当てる不透明度', unit: '' }] }],
      snippets: ['volume-transferFunction'],
      Sim: VolumeStep4,
    },
    {
      id: 'sampling',
      title: 'サンプリング（間隔と補間）',
      text: '光線上の標本は格子点の間に来るので、周囲の値から補間して求めます。Δs を広げるほど速くなりますが、薄い層を飛び越え、木目のような帯が出ます。光線の端点と間隔を動かし、不透明度補正を切り替えて三つの画像の濃さを比べてください。',
      formulas: [
        { caption: '標本間隔に合わせた不透明度', tex: '\\alpha^{\\prime}=1-(1-\\alpha)^{\\Delta s/\\Delta s_0}', symbols: [{ tex: '\\Delta s_0', meaning: '基準の標本間隔', unit: '\\mathrm{length}' }, { tex: '\\alpha^{\\prime}', meaning: '補正後の不透明度', unit: '' }] },
        { caption: '三重線形補間', tex: 'f(x,y,z)=\\sum_{i,j,k\\in\\{0,1\\}}w_{ijk}f_{ijk}', symbols: [{ tex: 'w_{ijk}', meaning: '三方向の距離から決まる重み', unit: '' }] },
      ],
      snippets: ['volume-opacityCorrection', 'isosurface-trilinear'],
      Sim: VolumeStep5,
    },
    {
      id: 'slicing',
      title: '板を重ねて描く（テクスチャベース）',
      text: '3D テクスチャを薄い板に切り、奥から半透明の画像を順に重ねます。GPU は画像の合成を高速に行えるため、この方法は軽量です。画面を回して軸の自動選択を切り替え、斜めから固定軸の板を見ると隙間が現れる様子を見てください。',
      formulas: [
        { caption: '後ろから順の合成', tex: 'C\\leftarrow\\alpha_i c_i+(1-\\alpha_i)C', symbols: [{ tex: 'C', meaning: '積み上げた色', unit: '' }] },
        { caption: '板の間隔', tex: '\\Delta s=\\frac{L}{K}', symbols: [{ tex: 'L', meaning: '体積の長さ', unit: '\\mathrm{length}' }, { tex: 'K', meaning: '板の枚数', unit: '' }] },
      ],
      snippets: ['volume-sliceAxis', 'volume-compositeBackToFront'],
      Sim: VolumeStep6,
    },
  ],
  combination: {
    text: '全体の画素 1 つは、目から伸ばした光線 1 本の計算でできている。',
    flow: [
      { steps: [5], text: '光線の上で Δs ごとに値を補間して取る' },
      { steps: [4], text: '値を色と不透明度に' },
      { steps: [1, 2], text: '弱まりと発光の式を' },
      { steps: [3], text: '区切って手前から足す（不透明になったら打ち切る）' },
      { steps: [6], text: '同じ足し方を、板を重ねて GPU で' },
    ],
  },
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
