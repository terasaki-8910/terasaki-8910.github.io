/**
 * プロジェクト一覧。ProjectShowcase.jsx(トップページのカード表示)と
 * ProjectMenu.jsx(ヘッダー右上のメニュー)の両方から参照する単一の情報源。
 *
 * pageKeyはHeader.jsxのcurrentPageプロパティと対応させる(そのページに
 * いる間はメニュー内の自分の項目をactive表示にするため)。専用ページを
 * 持たないプロジェクトはnull。
 *
 * Gaming Archiveは2026-08-09にSteam連携で実装済み(scripts/update-steam.js、
 * GamingArchivePage.jsx)。Discordはライブ連携せず、Footerの招待リンクのまま
 * (本人判断、常時起動が要るBot/第三者サービス依存を避けた)。
 */
export const projects = [
  {
    id: 2,
    title: 'Spotify Dashboard',
    description: '最近聴いた曲',
    tags: ['Web Audio API', 'React', 'Spotify Integration'],
    link: '/spotify/',
    spotify: true,
    pageKey: 'spotify',
  },
  {
    id: 4,
    title: 'Tsukuba Gomi Calendar',
    description: 'つくば市ごみ収集カレンダー — オープンデータ連携',
    tags: ['Open Data', 'iCal', 'React'],
    link: '/gomi-tsukuba/',
    gomi: true,
    pageKey: 'gomi',
  },
  {
    id: 5,
    title: '理想の推しア◯ネイター',
    description: '質問への回答からベイズ推定でキャラを推測',
    tags: ['Bayesian', 'TypeScript', 'React'],
    link: '/chara-picker/',
    charaPicker: true,
    pageKey: 'chara',
  },
  {
    id: 3,
    title: 'Gaming Archive',
    description: 'お気に入りのゲームコレクション',
    tags: ['Steam', 'Discord', 'Community'],
    link: '/gaming-archive/',
    gaming: true,
    pageKey: 'gaming',
  },
]
