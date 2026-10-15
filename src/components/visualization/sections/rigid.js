// 節「剛体と衝突」のデータ。形は sections/index.js を見る。
// 全体 → 段階 1〜6(計算ごとの小さなシミュレーション)→ 組み合わせ。シミュレーションは節を開くまで読み込まない。
import { lazy } from 'react'

const RigidSim = lazy(() => import('../sims/RigidSim.jsx'))
const RigidStep1 = lazy(() => import('../sims/rigidStep1.jsx'))
const RigidStep2 = lazy(() => import('../sims/rigidStep2.jsx'))
const RigidStep3 = lazy(() => import('../sims/rigidStep3.jsx'))
const RigidStep4 = lazy(() => import('../sims/rigidStep4.jsx'))

export default {
  id: 'rigid',
  title: '剛体と衝突',
  tabLabel: '剛体',
  intro: '箱の中の円が、重力で落ちて、壁や円どうしにぶつかる。円はつかんで投げられる。',
  overview: {
    Sim: RigidSim,
    caption: '円をつかんで投げられる。軸の数は位置 [m]、右上の矢印は重力 g。「広域の判定を表示」で、候補に絞った組（細い線）と、実際に重なっている組（太い線）が見える。',
  },
  steps: [
    {
      id: 'euler',
      title: '運動方程式と前進オイラー法',
      text: '円の加速度は、はたらく力を質量で割った値（a = F/m）で、空中では重力による g だけが下向きにはたらきます。これを Δt ごとに区切り、「いまの速度で Δt だけ進み、速度に gΔt を足す」を繰り返すのが前進オイラー法で、点が計算、線が式で解いた正しい落ち方です。左端の円をつかんで落とす高さを変え、Δt を大きくすると、点が線から離れていき、そのずれは Δt に比例します。',
      formulas: [
        {
          caption: '運動方程式から前進オイラー法へ',
          tex: '\\begin{aligned} m\\,\\mathbf{a} &= \\mathbf{F}, \\quad \\mathbf{a} = \\frac{d\\mathbf{v}}{dt}, \\quad \\mathbf{v} = \\frac{d\\mathbf{x}}{dt} \\\\ \\mathbf{x}_{t+\\Delta t} &= \\mathbf{x}_t + \\Delta t\\,\\mathbf{v}_t \\\\ \\mathbf{v}_{t+\\Delta t} &= \\mathbf{v}_t + \\Delta t\\,\\mathbf{g} \\end{aligned}',
          symbols: [
            { tex: 'm,\\ \\mathbf{F}', meaning: '質量と力（空中の円には重力 m g だけがはたらくので、a = g）', unit: '\\mathrm{kg},\\ \\mathrm{N}' },
            { tex: '\\mathbf{x},\\ \\mathbf{v},\\ \\mathbf{a}', meaning: '円の中心の位置、速度（位置の変化の割合）、加速度（速度の変化の割合）', unit: '\\mathrm{m},\\ \\mathrm{m/s},\\ \\mathrm{m/s^2}' },
            { tex: '\\mathbf{g}', meaning: '重力加速度（下向き）', unit: '\\mathrm{m/s^2}' },
            { tex: '\\Delta t', meaning: '時間刻み', unit: '\\mathrm{s}' },
          ],
        },
        {
          caption: '真下に落とすときの正しい値と、前進オイラー法のずれ',
          tex: '\\begin{aligned} y(t) &= y_0 - \\tfrac{1}{2}\\,g\\,t^2 \\\\ y_n - y(t_n) &= \\tfrac{1}{2}\\,g\\,\\Delta t\\,t_n \\qquad (t_n = n\\,\\Delta t) \\end{aligned}',
          symbols: [
            { tex: 'y_0', meaning: '落とす高さ（初速度は 0）', unit: '\\mathrm{m}' },
            { tex: 'y(t)', meaning: '式で解いた正しい高さ（解析解）', unit: '\\mathrm{m}' },
            { tex: 'y_n', meaning: '前進オイラー法で n 回進めた高さ', unit: '\\mathrm{m}' },
            { tex: 't_n', meaning: 'n 回目の時刻', unit: '\\mathrm{s}' },
          ],
        },
      ],
      snippets: ['integrate-eulerStep'],
      Sim: RigidStep1,
    },
    {
      id: 'restitution',
      title: '反発係数',
      text: '円が床にぶつかると、床に垂直な向きの速さが e 倍になって向きが逆になります（e は反発係数で、0 ならはね返らず、1 なら損失がありません）。落ちる高さは速さの 2 乗に比例する（v² = 2gh）ので、速さが e 倍になれば、はね返って届く高さは e² 倍です。左端の円をつかんで落とす高さを変えたり、e を変えたりすると、計算で出た頂点（輪）が、この関係から予想した高さ（破線）の上に並びます。',
      formulas: [
        {
          caption: '反発係数と床での反発',
          tex: 'e = -\\frac{v_n^{\\prime}}{v_n}, \\qquad \\mathbf{v}_r = \\mathbf{v} - (1+e)\\,(\\mathbf{v}\\cdot\\mathbf{n})\\,\\mathbf{n}',
          symbols: [
            { tex: 'e', meaning: '反発係数（0 ならはね返らず、1 なら損失なし）', unit: '' },
            { tex: 'v_n,\\ v_n^{\\prime}', meaning: '衝突の前後の、面に垂直な向きの速度', unit: '\\mathrm{m/s}' },
            { tex: '\\mathbf{v},\\ \\mathbf{v}_r', meaning: '衝突の前の速度と、はね返った後の速度', unit: '\\mathrm{m/s}' },
            { tex: '\\mathbf{n}', meaning: '床や壁の、箱の内側を向く単位法線', unit: '' },
          ],
        },
        {
          caption: 'はね返りの高さ',
          tex: 'v^2 = 2\\,g\\,h \\;\\Longrightarrow\\; h_1 = \\frac{(e\\,v)^2}{2\\,g} = e^2 h_0, \\qquad h_k = e^{2k}\\,h_0',
          symbols: [
            { tex: 'h_0', meaning: '落とした高さ（床から）', unit: '\\mathrm{m}' },
            { tex: 'h_k', meaning: 'k 回はね返った後の頂点の高さ', unit: '\\mathrm{m}' },
            { tex: 'v', meaning: '床にぶつかる直前の速さ', unit: '\\mathrm{m/s}' },
          ],
        },
      ],
      snippets: ['collide-reflectVelocity'],
      Sim: RigidStep2,
    },
    {
      id: 'circle-overlap',
      title: '円の重なり判定',
      text: '2 つの円が重なるのは、中心間の距離 d が、2 つの半径の和以下のときです。距離には平方根がつきますが、両辺とも 0 以上なので 2 乗しても大小は変わらず、d² = (x の差)² + (y の差)² と、半径の和の 2 乗を比べるだけで済みます。円をつかんで動かし、2 つの数の大小が入れ替わる所を探してください。',
      formulas: [
        {
          caption: '円の重なり判定',
          tex: '\\lVert \\mathbf{c}_1 - \\mathbf{c}_2 \\rVert \\le r_1 + r_2 \\iff \\lVert \\mathbf{c}_1 - \\mathbf{c}_2 \\rVert^2 \\le (r_1 + r_2)^2',
          symbols: [
            { tex: '\\mathbf{c}_1,\\ \\mathbf{c}_2', meaning: '2 つの円の中心', unit: '\\mathrm{m}' },
            { tex: 'r_1,\\ r_2', meaning: '半径', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['collide-circlesOverlap'],
      Sim: RigidStep3,
    },
    {
      id: 'broad-phase',
      title: '広域の判定（AABB と Sweep and Prune）',
      text: '円が N 個あると組は N(N−1)/2 個あり、全部の組で円の重なりを調べるのは重くなります。そこでまず、円を囲む軸に平行な箱（AABB）で大まかに調べます。箱どうしの重なりは、x と y のそれぞれで区間が重なるかを比べるだけで、距離も平方根も要りません。さらに、箱を x 軸に落とした区間を左から順にたどり（Sweep and Prune）、走査線にかかっている箱とだけ比べます。円や走査線をつかんで動かし、総当たりの数と候補の数の差を見てください。',
      formulas: [
        {
          caption: '組の数',
          tex: '\\binom{N}{2} = \\frac{N\\,(N-1)}{2}',
          symbols: [{ tex: 'N', meaning: '円の数（組は、順番を区別せずに 2 つ選ぶ）', unit: '' }],
        },
        {
          caption: 'AABB の重なり判定',
          tex: '\\left(a_k^{\\min} \\le b_k^{\\max}\\right) \\land \\left(b_k^{\\min} \\le a_k^{\\max}\\right) \\quad (k = x,\\ y)',
          symbols: [
            { tex: 'a_k^{\\min},\\ a_k^{\\max}', meaning: '箱 a の、k 軸での最小値と最大値（円なら中心 ± 半径）', unit: '\\mathrm{m}' },
            { tex: 'b_k^{\\min},\\ b_k^{\\max}', meaning: '箱 b の、k 軸での最小値と最大値', unit: '\\mathrm{m}' },
          ],
        },
      ],
      snippets: ['collide-pairCount', 'collide-aabbOverlap', 'collide-sweepAndPrune'],
      Sim: RigidStep4,
    },
  ],
  combination: {
    text: '1 フレーム（1/60 s）を 8 回のサブステップに分け、サブステップごとに次を順に行います。',
    flow: [
      { steps: [1], text: '重力のもとで、位置と速度を Δt だけ進める（前進オイラー法）' },
      { steps: [4], text: '円を囲む箱を x 軸に並べて、ぶつかりそうな候補の組だけに絞る' },
      { steps: [3], text: '円どうしが重なっているかを、距離の 2 乗と半径の和の 2 乗で判定する' },
      { steps: [2], text: '床や壁にぶつかったら、法線方向の速さを −e 倍にして反発させる' },
    ],
  },
  sources: [
    { text: 'Baraff, An Introduction to Physically Based Modeling: Rigid Body Simulation II, SIGGRAPH Course Notes (1997)' },
    { text: 'Ericson, Real-Time Collision Detection, Morgan Kaufmann (2004)' },
    { text: 'Hairer, Nørsett, Wanner, Solving Ordinary Differential Equations I, 2nd ed., Springer (1993)' },
  ],

  // 段階に分ける前の式と抜粋と説明(sections/index.js を見る)。段階へ移し終えたら消す
  legacyFormulas: [
    {
      id: 'impulse',
      caption: '撃力による衝突の応答',
      tex: 'j = \\frac{(1+e)\\,(\\mathbf{v}_1 - \\mathbf{v}_2)\\cdot\\mathbf{n}}{1/m_1 + 1/m_2}, \\qquad \\mathbf{v}_1^{\\prime} = \\mathbf{v}_1 - \\frac{j}{m_1}\\mathbf{n}, \\quad \\mathbf{v}_2^{\\prime} = \\mathbf{v}_2 + \\frac{j}{m_2}\\mathbf{n}',
      symbols: [
        { tex: 'j', meaning: '撃力の大きさ（力を一瞬だけ加えた量）', unit: '\\mathrm{N\\,s}' },
        { tex: 'm_1,\\ m_2', meaning: '質量（つかんでいる円は無限大として扱う）', unit: '\\mathrm{kg}' },
        { tex: '\\mathbf{v}_1,\\ \\mathbf{v}_2', meaning: '衝突の前の速度', unit: '\\mathrm{m/s}' },
        { tex: '\\mathbf{n}', meaning: '円 1 から円 2 へ向かう単位法線', unit: '' },
      ],
    },
  ],
  legacySnippets: [
    'collide-resolveCircles',
  ],
  legacyDescription:
    '箱の中の円が、重力で落ちて壁や円どうしにぶつかる。位置と速度は前進オイラー法で小さく刻んで進め、ぶつかったら撃力で速度を変える。全部の組を調べる代わりに、AABB と Sweep and Prune で候補を絞ってから円の重なりを調べる。反発係数 e が 0 ならはね返らず、1 なら損失がないが、前進オイラー法ではエネルギーが少しずつ増えるので、サブステップを増やして抑える。',
}
