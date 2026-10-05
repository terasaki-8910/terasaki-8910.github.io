/**
 * プロジェクト一覧。ProjectShowcase.jsx(トップページのカード表示)と
 * ProjectMenu.jsx(ヘッダー右上のメニュー)の両方から参照する単一の情報源。
 *
 * icon はヘッダーのメニューの行に出すアイコン(src/data/menuIcons.js のキー)。
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
  // 3D ASCIIはトップの独立セクションから、この一覧の1項目に移した。
  // 専用ページ(/ascii/)は項目のリンク先として残している。
  // ascii: true の項目は、ProjectShowcase.jsx が項目内にビューアを出す。
  {
    id: 6,
    title: '3D ASCII',
    description: '3Dモデルを文字に置き換えたproject',
    tags: ['three.js', 'Canvas', 'React'],
    link: '/ascii/',
    ascii: true,
    pageKey: 'ascii',
    icon: 'palette',
  },
  {
    id: 2,
    title: 'Spotify Dashboard',
    description: '最近聴いた曲',
    tags: ['Web Audio API', 'React', 'Spotify Integration'],
    link: '/spotify/',
    spotify: true,
    pageKey: 'spotify',
    icon: 'musicNotes',
  },
  {
    id: 4,
    title: 'Tsukuba Gomi Calendar',
    description: 'つくば市ごみ収集カレンダー — オープンデータ連携',
    tags: ['Open Data', 'iCal', 'React'],
    link: '/gomi-tsukuba/',
    gomi: true,
    pageKey: 'gomi',
    icon: 'trash',
  },
  {
    id: 5,
    title: '理想の推しア◯ネイター',
    description: '質問への回答からベイズ推定でキャラを推測',
    tags: ['Bayesian', 'TypeScript', 'React'],
    link: '/chara-picker/',
    charaPicker: true,
    pageKey: 'chara',
    icon: 'magicLamp',
  },
  {
    id: 3,
    title: 'Gaming Archive',
    description: 'お気に入りのゲームコレクション',
    tags: ['Steam', 'Discord', 'Community'],
    link: '/gaming-archive/',
    gaming: true,
    pageKey: 'gaming',
    icon: 'gameController',
  },
  // 2026-10-05 追加。名前とアイコンは仮(確認シートで決める)
  {
    id: 7,
    title: 'Movie Shelf',
    description: 'Trakt に記録した映画（観た・評価・観たい）',
    tags: ['Trakt', 'TMDB', 'React'],
    link: '/movies/',
    pageKey: 'movies',
    icon: 'filmSlate',
  },
]
