// 節「変換・投影・補間・IK」のデータ。形は sections/index.js を見る。
// 全体は 2 関節の腕のキーフレームアニメーション(sims/transformOverview.jsx)。段階 1〜8 は、その計算を 1 つずつ取り出した小さなシミュレーション
// (sims/transformStep1〜8.jsx)。どれもこの節を開くまで読み込まず、段階は画面に近づいてから作る(StepSection の LazyMount)。
import { lazy } from 'react'

const TransformOverview = lazy(() => import('../sims/transformOverview.jsx'))
const Step1 = lazy(() => import('../sims/transformStep1.jsx'))
const Step2 = lazy(() => import('../sims/transformStep2.jsx'))
const Step3 = lazy(() => import('../sims/transformStep3.jsx'))
const Step4 = lazy(() => import('../sims/transformStep4.jsx'))
const Step5 = lazy(() => import('../sims/transformStep5.jsx'))
const Step6 = lazy(() => import('../sims/transformStep6.jsx'))
const Step7 = lazy(() => import('../sims/transformStep7.jsx'))
const Step8 = lazy(() => import('../sims/transformStep8.jsx'))

export default {
  id: 'transform',
  title: '変換・投影・補間・IK',
  tabLabel: '変換・IK',
  intro: '2 関節の腕のキーフレームアニメーションを、カメラで撮って画面に描く。補間・IK・3 次元の変換・投影・画面への写しを、計算ごとに分けて動かして確かめる。',
  overview: {
    Sim: TransformOverview,
    caption: '左の図は、ドラッグで見る向きを回せる。右の絵は、右のバーで動かすカメラが撮ったもの。再生すると、腕が番号の順にキーフレームをなぞる。',
  },
  steps: [
    {
      id: 'homogeneous-translation',
      title: '同次座標と平行移動',
      text: '平行移動は、3×3 の行列の掛け算では書けない（原点が必ず原点に移ってしまう）。そこで点に 4 つ目の成分 w = 1 を足して (x, y, z, 1) とし、右端の列に移動量を入れた 4×4 の行列を掛ける。向きのベクトルは w = 0 にしておくと、移動量が掛からないので動かない。',
      formulas: [
        {
          tex: String.raw`\begin{aligned}
T &= \begin{pmatrix} 1 & 0 & 0 & t_x \\ 0 & 1 & 0 & t_y \\ 0 & 0 & 1 & t_z \\ 0 & 0 & 0 & 1 \end{pmatrix} \\[6pt]
T \begin{pmatrix} x \\ y \\ z \\ 1 \end{pmatrix} &= \begin{pmatrix} x + t_x \\ y + t_y \\ z + t_z \\ 1 \end{pmatrix}, \qquad
T \begin{pmatrix} d_x \\ d_y \\ d_z \\ 0 \end{pmatrix} = \begin{pmatrix} d_x \\ d_y \\ d_z \\ 0 \end{pmatrix}
\end{aligned}`,
          symbols: [
            { tex: String.raw`T`, meaning: '平行移動の 4×4 行列。右端の列が移動量', unit: '' },
            { tex: String.raw`t_x,\ t_y,\ t_z`, meaning: '各軸の向きの移動量', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`(x,\ y,\ z,\ 1)`, meaning: '位置の同次座標。4 つ目の成分 w = 1 のとき、移動量が足される', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`(d_x,\ d_y,\ d_z,\ 0)`, meaning: '向きの同次座標。w = 0 のとき、移動量が掛からず、向きは変わらない', unit: '' },
          ],
        },
      ],
      snippets: ['mat4-translate', 'mat4-transformPoint'],
      Sim: Step1,
    },
    {
      id: 'rotation-scale',
      title: '回転と拡大',
      text: '拡大は、対角成分に倍率を並べるだけ。回転は、z 軸まわりなら (x, y) を cos と sin で回す式で、x 軸まわり・y 軸まわりも同じ形（符号の位置だけが違う）。3 つの軸まわりの回転を Rz·Ry·Rx の順に掛けて、1 つの R にまとめる。',
      formulas: [
        {
          tex: String.raw`\begin{aligned}
R_z(\theta) &= \begin{pmatrix} \cos\theta & -\sin\theta & 0 & 0 \\ \sin\theta & \cos\theta & 0 & 0 \\ 0 & 0 & 1 & 0 \\ 0 & 0 & 0 & 1 \end{pmatrix}, \qquad
S = \begin{pmatrix} s_x & 0 & 0 & 0 \\ 0 & s_y & 0 & 0 \\ 0 & 0 & s_z & 0 \\ 0 & 0 & 0 & 1 \end{pmatrix} \\[6pt]
R &= R_z(\theta_z)\,R_y(\theta_y)\,R_x(\theta_x)
\end{aligned}`,
          symbols: [
            { tex: String.raw`R_x,\ R_y,\ R_z`, meaning: '各軸のまわりの回転の 4×4 行列（軸の正の側から見て、反時計回りが正）', unit: '' },
            { tex: String.raw`\theta_x,\ \theta_y,\ \theta_z`, meaning: '各軸のまわりの回転角', unit: String.raw`\mathrm{rad}` },
            { tex: 'R', meaning: '3 つの回転をまとめた行列。左上の 3×3 は直交行列で、行列式は 1', unit: '' },
            { tex: String.raw`s_x,\ s_y,\ s_z`, meaning: '軸ごとの拡大率', unit: '' },
          ],
        },
      ],
      snippets: ['mat4-scale', 'mat4-rotateX', 'mat4-rotateY', 'mat4-rotateZ'],
      Sim: Step2,
    },
    {
      id: 'composition-order',
      title: '合成の順',
      text: '行列の積は、掛ける順を入れ替えると結果が変わる（AB と BA は一般に違う）。M = T·R·S は、点に右から S、R、T の順に効く。S·R·T は先に移動してから回すので、箱は原点のまわりを回り、そのあと原点から拡大される。',
      formulas: [
        {
          tex: String.raw`\begin{aligned}
M_{TRS} &= T\,R\,S = \begin{pmatrix} R_3 S & \mathbf{t} \\ \mathbf{0}^{\mathsf T} & 1 \end{pmatrix} \\[6pt]
M_{SRT} &= S\,R\,T = \begin{pmatrix} S R_3 & S R_3\,\mathbf{t} \\ \mathbf{0}^{\mathsf T} & 1 \end{pmatrix}
\end{aligned}`,
          symbols: [
            { tex: String.raw`M_{TRS},\ M_{SRT}`, meaning: '同じ T・R・S を、掛ける順だけ変えた 2 つの行列。右にあるほど先に点へ効く', unit: '' },
            { tex: String.raw`R_3,\ S`, meaning: '回転の 3×3 と、拡大の対角行列（S は 3×3 として読む）', unit: '' },
            { tex: String.raw`\mathbf{t}`, meaning: '平行移動量。T·R·S ではそのまま右端の列に入り、S·R·T では S·R₃ で回して拡大した値になる', unit: String.raw`\mathrm{m}` },
          ],
        },
      ],
      snippets: ['mat4-multiply', 'mat4-compose'],
      Sim: Step3,
    },
    {
      id: 'perspective-projection',
      title: '透視投影（カメラ目線）',
      text: 'カメラを原点に置き、前（+z の向き）に距離 f のところへ投影面を立てる。点とカメラを結ぶ直線が投影面と交わる高さが、画面に写る位置になる。相似な三角形から y′ = f·y / z で、遠い（z が大きい）ほど小さく写る。',
      formulas: [
        {
          tex: String.raw`\frac{y'}{f} = \frac{y}{z} \quad\Longrightarrow\quad x' = \frac{f\,x}{z}, \qquad y' = \frac{f\,y}{z}`,
          symbols: [
            { tex: String.raw`(x,\ y,\ z)`, meaning: 'カメラから見た点の位置。z がカメラから前への距離（正）', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`(x',\ y')`, meaning: '投影面の上の像の位置', unit: String.raw`\mathrm{m}` },
            { tex: 'f', meaning: 'カメラ（投影中心）から投影面までの距離', unit: String.raw`\mathrm{m}` },
          ],
        },
      ],
      snippets: ['projection-perspectiveProject'],
      Sim: Step4,
    },
    {
      id: 'frustum-clipping',
      title: '視錐台とクリッピング',
      text: 'カメラに写る範囲は、視野角・near・far で決まる台形の立体（視錐台）になる。投影の行列を掛けた (x_c, y_c, z_c, w_c) が −w_c ≤ x_c, y_c, z_c ≤ w_c を満たす点だけが範囲の中にある。w_c で割る前に調べるのは、カメラの後ろの点（w_c < 0）を先に割ると、符号が反転して前に出てきてしまうため。',
      formulas: [
        {
          tex: String.raw`\begin{aligned}
P &= \begin{pmatrix}
\dfrac{c}{a} & 0 & 0 & 0 \\
0 & c & 0 & 0 \\
0 & 0 & \dfrac{f+n}{n-f} & \dfrac{2fn}{n-f} \\
0 & 0 & -1 & 0
\end{pmatrix}, \qquad c = \cot\frac{\theta_{\mathrm{fov}}}{2} \\[6pt]
\begin{pmatrix} x_c \\ y_c \\ z_c \\ w_c \end{pmatrix} &= P \begin{pmatrix} x \\ y \\ z \\ 1 \end{pmatrix}, \qquad
-w_c \le x_c,\ y_c,\ z_c \le w_c, \qquad
\begin{pmatrix} x_n \\ y_n \\ z_n \end{pmatrix} = \frac{1}{w_c}\begin{pmatrix} x_c \\ y_c \\ z_c \end{pmatrix}
\end{aligned}`,
          symbols: [
            { tex: String.raw`\theta_{\mathrm{fov}}`, meaning: '縦の視野角', unit: String.raw`\mathrm{rad}` },
            { tex: 'a', meaning: '画面の縦横比（幅 ÷ 高さ）', unit: '' },
            { tex: String.raw`n,\ f`, meaning: 'カメラから手前の面（near）と奥の面（far）までの距離。どちらも正で n < f', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`x_c,\ y_c,\ z_c,\ w_c`, meaning: 'クリップ座標。4 つ目の成分は、カメラからの奥行き（−z）に等しい', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`x_n,\ y_n,\ z_n`, meaning: '正規化デバイス座標。視錐台の内側は、どの成分も −1 から 1', unit: '' },
          ],
        },
      ],
      snippets: ['projection-perspectiveMatrix', 'projection-insideClip', 'projection-toNDC'],
      Sim: Step5,
    },
    {
      id: 'viewport',
      title: 'ビューポート変換',
      text: '正規化デバイス座標（−1〜1 の正方形）を、ウィンドウの画素の長方形に移す。x_n を 0〜1 にして、ウィンドウの幅を掛けるだけの 1 次式なので、ウィンドウの大きさを変えても、四角の中の同じ割合の位置に写る。',
      formulas: [
        {
          tex: String.raw`\begin{aligned}
x_s &= x_0 + \frac{W}{2}\,(x_n + 1) \\
y_s &= y_0 + \frac{H}{2}\,(y_n + 1)
\end{aligned}`,
          symbols: [
            { tex: String.raw`x_n,\ y_n`, meaning: '正規化デバイス座標（−1〜1）', unit: '' },
            { tex: String.raw`x_s,\ y_s`, meaning: 'ウィンドウ上の座標（左下が原点で、y は上向き）', unit: String.raw`\mathrm{px}` },
            { tex: String.raw`x_0,\ y_0`, meaning: 'ウィンドウの隅の位置', unit: String.raw`\mathrm{px}` },
            { tex: String.raw`W,\ H`, meaning: 'ウィンドウの幅と高さ', unit: String.raw`\mathrm{px}` },
          ],
        },
      ],
      snippets: ['projection-viewport'],
      Sim: Step6,
    },
    {
      id: 'keyframe-interpolation',
      title: 'キーフレームの補間',
      text: 'アニメーションは、いくつかの時刻（キーフレーム）の値だけを決めておき、その間を計算で埋める。2 点を直線でつなぐのが線形補間。区間ごとの 3 次式を、つなぎ目で傾きと曲がり方がそろうようにつなぐのが 3 次スプラインで、同じ値が並ぶ区間でも滑らかに膨らむ。',
      formulas: [
        {
          tex: String.raw`L(x) = (1-u)\,y_i + u\,y_{i+1}, \qquad u = \frac{x - x_i}{x_{i+1} - x_i}, \quad x_i \le x \le x_{i+1}`,
          symbols: [
            { tex: String.raw`x_i`, meaning: 'キーフレームの時刻', unit: String.raw`\mathrm{s}` },
            { tex: String.raw`y_i`, meaning: 'キーフレームの値', unit: '' },
            { tex: 'u', meaning: '区間の中での位置（0 で始点、1 で終点）', unit: '' },
          ],
        },
        {
          tex: String.raw`\begin{aligned}
S_i(x) &= a_i (x - x_i)^3 + b_i (x - x_i)^2 + c_i (x - x_i) + d_i, \qquad x_i \le x \le x_{i+1} \\
S_i(x_i) &= y_i, \qquad S_i(x_{i+1}) = y_{i+1} \\
S_i'(x_{i+1}) &= S_{i+1}'(x_{i+1}), \qquad S_i''(x_{i+1}) = S_{i+1}''(x_{i+1}) \\
S_0''(x_0) &= S_{N-1}''(x_N) = 0 \\[6pt]
h_{i-1} m_{i-1} &+ 2(h_{i-1} + h_i)\, m_i + h_i m_{i+1} = 6\left(\frac{y_{i+1} - y_i}{h_i} - \frac{y_i - y_{i-1}}{h_{i-1}}\right)
\end{aligned}`,
          symbols: [
            { tex: String.raw`S_i`, meaning: '区間 i の 3 次式。N 区間で未知数は 4N 個', unit: '' },
            { tex: String.raw`a_i,\ b_i,\ c_i,\ d_i`, meaning: '区間 i の係数', unit: '' },
            { tex: String.raw`h_i`, meaning: '区間の幅（隣り合う節点の時刻の差）', unit: String.raw`\mathrm{s}` },
            { tex: String.raw`m_i`, meaning: '節点での 2 階微分の値。三重対角の連立方程式をトーマス法で解く', unit: '' },
          ],
        },
      ],
      snippets: ['spline-lerp', 'spline-naturalCubicSpline', 'spline-evalSpline'],
      Sim: Step7,
    },
    {
      id: 'inverse-kinematics',
      title: 'IK（腕の関節の角度を求める）',
      text: '手先を目標に届かせる、関節の角度を求める。2 本のリンクなら、原点・肘・手先の三角形の辺の長さから、余弦定理で角度が決まる（解析解。肘の向きが 2 通り）。一般の腕では、手先の速度と関節の角速度を結ぶヤコビアン J を使い、誤差を小さくする向きに角度を少しずつ変えるのを繰り返す。',
      formulas: [
        {
          tex: String.raw`\theta_2 = \pm\arccos\frac{x^2 + y^2 - l_1^2 - l_2^2}{2\,l_1 l_2}, \qquad
\theta_1 = \operatorname{atan2}(y,\, x) \mp \arccos\frac{l_1^2 + x^2 + y^2 - l_2^2}{2\,l_1 \sqrt{x^2 + y^2}}`,
          symbols: [
            { tex: String.raw`l_1,\ l_2`, meaning: '根元側と先端側のリンクの長さ', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`x,\ y`, meaning: '手先の目標。原点（根元）からの距離が、2 本のリンクの長さの差以上、和以下のときだけ届く', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`\theta_1`, meaning: '1 本目の向き（x 軸から反時計回り）', unit: String.raw`\mathrm{rad}` },
            { tex: String.raw`\theta_2`, meaning: '関節の曲げ角（1 本目の延長から反時計回り）。± は肘の 2 つの解で、上と下の符号が対応する', unit: String.raw`\mathrm{rad}` },
          ],
        },
        {
          tex: String.raw`\begin{aligned}
J &= \frac{\partial(x,\, y)}{\partial(\theta_1,\, \theta_2)} = \begin{pmatrix}
-l_1 \sin\theta_1 - l_2 \sin(\theta_1 + \theta_2) & -l_2 \sin(\theta_1 + \theta_2) \\
l_1 \cos\theta_1 + l_2 \cos(\theta_1 + \theta_2) & l_2 \cos(\theta_1 + \theta_2)
\end{pmatrix} \\[6pt]
\Delta\boldsymbol{\theta} &= J^{\mathsf T}\bigl(J J^{\mathsf T} + \lambda^2 I\bigr)^{-1}\mathbf{e}, \qquad \mathbf{e} = \mathbf{x}_{\mathrm{goal}} - \mathbf{x}_{\mathrm{tip}} \\[6pt]
\boldsymbol{\theta} &\leftarrow \boldsymbol{\theta} + k\,\Delta\boldsymbol{\theta}, \qquad k = \min\!\left(1,\ \frac{\Delta\theta_{\max}}{\lVert \Delta\boldsymbol{\theta} \rVert}\right)
\end{aligned}`,
          symbols: [
            { tex: 'J', meaning: 'ヤコビアン。手先の速度は J × 関節の角速度。2 本が一直線になる姿勢（伸びきる・折りたたむ）で特異になる', unit: String.raw`\mathrm{m/rad}` },
            { tex: String.raw`\mathbf{e}`, meaning: '手先の誤差（目標 − 手先）', unit: String.raw`\mathrm{m}` },
            { tex: String.raw`\Delta\boldsymbol{\theta}`, meaning: '関節角の変化', unit: String.raw`\mathrm{rad}` },
            { tex: String.raw`\lambda`, meaning: '減衰係数。大きいほど特異な姿勢でも安定するが、1 歩は小さくなる', unit: String.raw`\mathrm{m/rad}` },
            { tex: String.raw`\Delta\theta_{\max}`, meaning: '1 歩で動かしてよい関節角の上限。J は小さな動きでしか正しくないので、超えたら縮める', unit: String.raw`\mathrm{rad}` },
          ],
        },
      ],
      snippets: ['ik-fk2', 'ik-ik2Analytic', 'ik-jacobian2', 'ik-ikStep'],
      Sim: Step8,
    },
  ],
  combination: {
    text: '全体の腕は、段階 7 → 8 → 1〜3 → 4〜6 の順につながって、画面に出る。番号を押すと、その段階へ移る。',
    flow: [
      { steps: [7], text: 'キーフレームの手先の位置を、スプラインでつなぎ、時刻ごとの手先の目標を決める' },
      { steps: [8], text: '目標に手先が届くよう、IK で 2 つの関節の角度を求める' },
      { steps: [1, 2, 3], text: '角度から腕の箱の行列を作り、世界の 3 次元に置く（モデル変換。関節ごとに回転と平行移動を右から掛ける）' },
      { steps: [4, 5], text: 'カメラの位置から見た座標にして、透視投影で遠いほど小さく写し、視錐台の外を除く' },
      { steps: [6], text: 'ビューポート変換で、右の絵の画素の位置にする' },
    ],
  },
  sources: [
    { text: 'Foley, van Dam, Feiner, Hughes, Computer Graphics: Principles and Practice, 2nd ed., Addison-Wesley (1990)' },
    { text: 'Akenine-Möller, Haines, Hoffman, Real-Time Rendering, 4th ed., CRC Press (2018)' },
    {
      text: 'gluPerspective, OpenGL 2.1 Reference Pages, Khronos Group',
      href: 'https://registry.khronos.org/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml',
    },
    { text: 'de Boor, A Practical Guide to Splines, Springer (1978)' },
    { text: 'Burden, Faires, Numerical Analysis, 9th ed., Brooks/Cole (2011)' },
    { text: 'Craig, Introduction to Robotics: Mechanics and Control, 3rd ed., Pearson (2005)' },
    {
      text: 'Buss, Introduction to Inverse Kinematics with Jacobian Transpose, Pseudoinverse and Damped Least Squares methods (2004)',
      href: 'https://www.math.ucsd.edu/~sbuss/ResearchWeb/ikmethods/iksurvey.pdf',
    },
  ],
}
