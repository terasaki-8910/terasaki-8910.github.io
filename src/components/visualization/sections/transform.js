// 節「変換・投影・補間・IK」のデータ。形は sections/index.js を見る。
// シミュレーションは sims/TransformSim.jsx(1つの canvas で3つの見せ方を切り替える)。
// 節の中でしか使わない大きなコンポーネントなので、この節を開くまで読み込まない。
import { lazy } from 'react'

const TransformSim = lazy(() => import('../sims/TransformSim.jsx'))

export default {
  id: 'transform',
  title: '変換・投影・補間・IK',
  tabLabel: '変換・IK',
  intro: '立方体を、モデル行列・視点・透視投影・ビューポートの順に通して画面に描く。キーフレームの補間と、2 リンクの腕の IK も、見せ方を切り替えて動かせる。',
  overview: {
    Sim: TransformSim,
    caption: '上のタブで見せ方（立方体・補間・IK）を切り替える。立方体の向きと位置、カメラは、スライダーで変える。',
  },
  steps: [],
  combination: null,
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

  // 段階に分ける前の式と抜粋と説明(sections/index.js を見る)。段階へ移し終えたら消す
  legacyFormulas: [
    {
      id: 'homogeneous',
      caption: '同次座標の変換と合成',
      tex: String.raw`\begin{aligned}
\mathbf{p}' &= M\,\mathbf{p}, \qquad M = T\,R\,S \\
T &= \begin{pmatrix} I & \mathbf{t} \\ \mathbf{0}^{\mathsf T} & 1 \end{pmatrix}, \quad
R = \begin{pmatrix} R_3 & \mathbf{0} \\ \mathbf{0}^{\mathsf T} & 1 \end{pmatrix}, \quad
S = \begin{pmatrix} \mathrm{diag}(s_x,\, s_y,\, s_z) & \mathbf{0} \\ \mathbf{0}^{\mathsf T} & 1 \end{pmatrix} \\
R_3 &= R_z(\theta_z)\,R_y(\theta_y)\,R_x(\theta_x)
\end{aligned}`,
      symbols: [
        { tex: String.raw`\mathbf{p},\ \mathbf{p}'`, meaning: '変換の前と後の点。同次座標 (x, y, z, w) で、w = 1 は位置、w = 0 は向き（平行移動されない）', unit: String.raw`\mathrm{m}` },
        { tex: 'M', meaning: '合成した 4×4 の変換行列。右にある行列ほど先に点へ効く', unit: '' },
        { tex: String.raw`T,\ R,\ S`, meaning: '平行移動、回転、拡大の 4×4 行列。掛ける順を変えると結果が変わる', unit: '' },
        { tex: String.raw`\mathbf{t}`, meaning: '平行移動量', unit: String.raw`\mathrm{m}` },
        { tex: 'R_3', meaning: '3×3 の回転行列（直交行列で、行列式は +1）', unit: '' },
        { tex: String.raw`\theta_x,\ \theta_y,\ \theta_z`, meaning: '各軸のまわりの回転角（軸の正の側から見て反時計回りが正）', unit: String.raw`\mathrm{rad}` },
        { tex: String.raw`s_x,\ s_y,\ s_z`, meaning: '軸ごとの拡大率', unit: '' },
      ],
    },
    {
      id: 'perspective',
      caption: '透視投影',
      tex: String.raw`\begin{aligned}
P &= \begin{pmatrix}
\dfrac{c}{a} & 0 & 0 & 0 \\
0 & c & 0 & 0 \\
0 & 0 & \dfrac{f+n}{n-f} & \dfrac{2fn}{n-f} \\
0 & 0 & -1 & 0
\end{pmatrix}, \qquad c = \cot\frac{\theta_{\mathrm{fov}}}{2} \\[6pt]
\begin{pmatrix} x_c \\ y_c \\ z_c \\ w_c \end{pmatrix} &= P\,V\,M \begin{pmatrix} x \\ y \\ z \\ 1 \end{pmatrix}, \qquad
\begin{pmatrix} x_n \\ y_n \\ z_n \end{pmatrix} = \frac{1}{w_c}\begin{pmatrix} x_c \\ y_c \\ z_c \end{pmatrix}
\end{aligned}`,
      symbols: [
        { tex: String.raw`\theta_{\mathrm{fov}}`, meaning: '縦の視野角', unit: String.raw`\mathrm{rad}` },
        { tex: 'a', meaning: '画面の縦横比（幅 ÷ 高さ）', unit: '' },
        { tex: String.raw`n,\ f`, meaning: 'カメラから手前の面（near）と奥の面（far）までの距離。どちらも正で n < f', unit: String.raw`\mathrm{m}` },
        { tex: 'V', meaning: 'ビュー行列。世界座標をカメラの座標（カメラが原点で −z を向く）に移す', unit: '' },
        { tex: String.raw`x_c,\ y_c,\ z_c,\ w_c`, meaning: 'クリップ座標。4 つ目の成分は、カメラからの奥行き（−z）に等しい', unit: String.raw`\mathrm{m}` },
        { tex: String.raw`x_n,\ y_n,\ z_n`, meaning: '正規化デバイス座標。視錐台の内側は、どの成分も −1 から 1', unit: '' },
      ],
    },
    {
      id: 'viewport',
      caption: 'ビューポート変換',
      tex: String.raw`\begin{aligned}
x_s &= x_0 + \frac{W}{2}\,(x_n + 1) \\
y_s &= y_0 + \frac{H}{2}\,(y_n + 1)
\end{aligned}`,
      symbols: [
        { tex: String.raw`x_s,\ y_s`, meaning: 'ウィンドウ上の座標', unit: String.raw`\mathrm{px}` },
        { tex: String.raw`x_0,\ y_0`, meaning: 'ウィンドウの隅の位置', unit: String.raw`\mathrm{px}` },
        { tex: String.raw`W,\ H`, meaning: 'ウィンドウの幅と高さ', unit: String.raw`\mathrm{px}` },
      ],
    },
    {
      id: 'lerp',
      caption: '線形補間',
      tex: String.raw`L(x) = (1-u)\,y_i + u\,y_{i+1}, \qquad u = \frac{x - x_i}{x_{i+1} - x_i}, \quad x_i \le x \le x_{i+1}`,
      symbols: [
        { tex: String.raw`x_i`, meaning: 'キーフレームの時刻', unit: String.raw`\mathrm{s}` },
        { tex: String.raw`y_i`, meaning: 'キーフレームの値', unit: '' },
        { tex: 'u', meaning: '区間の中での位置（0 で始点、1 で終点）', unit: '' },
      ],
    },
    {
      id: 'spline',
      caption: '自然 3 次スプラインの条件',
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
    {
      id: 'ik-analytic',
      caption: '2 リンクの解析解（余弦定理）',
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
      id: 'ik-dls',
      caption: 'ヤコビアンと減衰つき最小二乗の更新',
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
  legacySnippets: [
    'mat4-multiply',
    'mat4-compose',
    'projection-perspectiveMatrix',
    'projection-toNDC',
    'projection-viewport',
    'raster-isBackFace',
    'spline-naturalCubicSpline',
    'ik-ik2Analytic',
    'ik-ikStep',
  ],
  legacyDescription:
    '立方体を、モデル行列、視点、透視投影、ビューポートの順に通して画面に描く。キーフレームの間は、線形補間と自然 3 次スプラインの 2 通りで結ぶ。2 リンクの腕は、解析解と、ヤコビアンの繰り返しで目標へ向ける。掛ける順や視野角、減衰の大きさを変えて、結果がどう変わるかを見られる。',
}
