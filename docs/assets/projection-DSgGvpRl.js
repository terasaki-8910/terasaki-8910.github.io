const n=`// 透視投影・平行投影、視錐台のクリップ、ビューポート変換(DOM に触れない純関数)。
// 点は [x, y, z]、同次座標のクリップ座標は [x, y, z, w]。行列は mat4.js と同じく
// 行優先の入れ子の配列で、点は列ベクトルとして M·p と掛ける。
// 向きに注意: perspectiveProject は投影中心が原点で +z を向く素朴なピンホールカメラ、
// perspectiveMatrix は OpenGL の慣習でカメラが -z を向く(w' = -z)。
// 出典: Akenine-Möller, Haines, Hoffman, Real-Time Rendering, 4th ed. (2018) /
// OpenGL の gluPerspective(Khronos の OpenGL リファレンス)

// @snippet projection-perspectiveProject
// 投影中心を原点、投影面を z = f に置く。点と原点を結ぶ直線が投影面と交わる
// 高さは、相似な三角形から y' / f = y / z。遠い(z が大きい)ほど小さく写る
export function perspectiveProject(p, f) {
  const [x, y, z] = p
  return [(f * x) / z, (f * y) / z]
}
// @end

// @snippet projection-projectToImage
// 投影面の長さを画素に直す拡大 s と、画像の中心 (x0, y0) への
// 平行移動を加える。同次座標では [[s,0,x0],[0,s,y0],[0,0,1]] を
// 透視投影の行列に左から掛けた形
export function projectToImage(p, f, s, x0, y0) {
  const [x, y, z] = p
  return [(s * f * x) / z + x0, (s * f * y) / z + y0]
}
// @end

// @snippet projection-parallelProject
// 投射線が平行なので、奥行き z を捨てるだけ(遠近感はない)。
// 投影中心を無限に遠ざけた透視投影(焦点距離 f → ∞)の極限に当たる
export function parallelProject(p) {
  return [p[0], p[1]]
}
// @end

// @snippet projection-perspectiveMatrix
// gluPerspective の行列。カメラは -z を見る。
// fovy は縦の視野角(ラジアン)、aspect は幅/高さ、near と far は正の距離。
// 出力の w' = -z (奥行きの正の値)で、あとで w' で割ると透視投影になる。
// z は near → -1、far → +1 に写る
export function perspectiveMatrix(fovy, aspect, near, far) {
  const fy = 1 / Math.tan(fovy / 2)
  return [
    [fy / aspect, 0, 0, 0],
    [0, fy, 0, 0],
    [0, 0, (far + near) / (near - far), (2 * far * near) / (near - far)],
    [0, 0, -1, 0],
  ]
}
// @end

// @snippet projection-toNDC
// クリップ座標 [x, y, z, w] を w で割り、正規化デバイス座標
// (-1〜1 の立方体)にする。w > 0 (カメラの前)の点にだけ使う
export function toNDC(clip) {
  const [x, y, z, w] = clip
  return [x / w, y / w, z / w]
}
// @end

// @snippet projection-insideClip
// ビューボリュームの中の点は -w <= x, y, z <= w を満たす。
// w で割る前に判定できる。カメラの後ろの点は w < 0 で、どの不等式も
// 成り立たない(先に割ると、後ろの点が鏡に映したように前へ出てしまう)
export function insideClip(clip) {
  const [x, y, z, w] = clip
  return -w <= x && x <= w && -w <= y && y <= w && -w <= z && z <= w
}
// @end

// @snippet projection-viewport
// 正規化デバイス座標の x, y (-1〜1)を、ウィンドウの
// [x0, x0+w] × [y0, y0+h] に移す1次式。
// (-1,-1) → (x0, y0)、(1,1) → (x0+w, y0+h)。y は上向きのまま
// (画面に合わせた上下の反転は描画側で行う)
export function viewport(ndc, x0, y0, w, h) {
  return [(w / 2) * (ndc[0] + 1) + x0, (h / 2) * (ndc[1] + 1) + y0]
}
// @end
`;export{n as default};
