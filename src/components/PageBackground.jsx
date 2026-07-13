// 全ページ(Home/3D ASCII/404)で共通の背景レイヤー。今は地の色を敷くだけの
// 空のレイヤーだが、将来ここに重音テトの動く背景アニメーション(TASKS.md
// 「重音テトの動くASCIIアート」参照)を追加する想定で、あらかじめ全ページに
// 差し込んでおく。追加時はこのコンポーネント1箇所を変えるだけで全ページに
// 反映される。3D ASCIIビューアの部分は自前のWebGLキャンバスが不透明に
// 上描きするため、このレイヤーの内容は実質隠れる見込み(要調整の可能性あり)。
export default function PageBackground() {
  return <div className="fixed inset-0 -z-10 bg-paper" aria-hidden="true" />
}
