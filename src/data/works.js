// /career/ の Works。文言は decisions(タスク 5「Works の文言」)のとおり。
// points は decisions の「工夫」を「／」で区切ったもの(ページでは1つずつ別の行にする)。
// shots: 実際に動いている画面のスクショ(public/career/works/)。何枚でも置ける。ページではどれも同じ高さにそろえ、
// 押すと full を大きく出す(確認シート15回目 R15-2)。
// このサイトは画面を載せても意味が無いので、画像なし(確認シート14回目)。
// background(作った経緯)と learned(学び)は本人が書く。空なら行を出さない。
// role の書き方(Claude Code を使ったこと)は下書き(確認シート14回目)。
export const works = [
  {
    name: 'このサイト',
    repo: 'terasaki-8910.github.io',
    summary: '作ったアプリや実験を載せている個人サイト（このページもその一部）',
    role: '個人で設計・実装・運用（Claude Code を使用）',
    background: '',
    learned: '',
    tech: 'React 18, Vite 5, Tailwind CSS 3, GSAP, three.js, GitHub Actions, GitHub Pages',
    points: [
      'Spotify・Steam・GitHub のデータを GitHub Actions で定期的に取得し（Spotify と Steam は6時間ごと、GitHub は1日1回）、静的サイトのまま更新',
    ],
  },
  {
    name: 'happydeck',
    repo: 'happydeck',
    summary: '複数のマシンで動いている Claude Code のセッションを、1つの画面で見て操作するデスクトップアプリ（Happy 経由）',
    role: '個人で設計・実装（Claude Code を使用）',
    // 1つのセッションを大きく出した画面(確認シート14回目 R14-33)
    shots: [{ src: '/career/works/happydeck.webp', full: '/career/works/happydeck-full.webp', width: 640, height: 400, alt: 'happydeck の画面（モックデータで、1つのセッションを大きく出したところ）' }],
    background: '',
    learned: '',
    tech: 'TypeScript, React 19, Vite, Tauri v2, Zod, Vitest, GitHub Actions',
    points: [
      'Happy の通信（端末の紐づけ、エンドツーエンド暗号、同期）を扱うクライアントを、公式のコードを使わずに TypeScript で実装し、画面とは別にテストを付けた',
      '本物のアカウントやマシンに触らずに画面を作れる、モックデータのモードを用意した',
    ],
  },
  {
    name: 'voice-transcript',
    repo: 'voice-transcript',
    summary: 'Groq の Whisper API で音声を文字起こしする、CLI とデスクトップアプリ',
    role: '個人で設計・実装（Claude Code を使用）',
    shots: [{ src: '/career/works/voice-transcript.webp', full: '/career/works/voice-transcript-full.webp', width: 601, height: 400, alt: 'voice-transcript の履歴の画面' }],
    background: '',
    learned: '',
    tech: 'TypeScript, React 19, Vite, Tauri v2, PostgreSQL, Drizzle ORM, ffmpeg, Vitest',
    points: [
      '無音の位置で音声を分割して文字起こしし、つなぎ直すことで、1時間を超える音声も扱える',
      'CLI とデスクトップアプリで同じエンジンを共有し、ffmpeg・API 呼び出し・DB などの特権操作は Rust 側に集めた',
    ],
  },
  {
    name: 'claude-usage-tray（UsageTray）',
    repo: 'claude-usage-tray',
    summary: 'Claude の使用量（5時間のセッション枠と週の枠）を、タスクトレイとメニューバーに常に表示するデスクトップアプリ',
    role: '個人で設計・実装・配布（Windows / macOS。Claude Code を使用）',
    shots: [{ src: '/career/works/claude-usage-tray.webp', full: '/career/works/claude-usage-tray-full.webp', width: 304, height: 367, alt: 'UsageTray のポップアップ（使用量の表示）' }],
    background: '',
    learned: '',
    tech: 'TypeScript, Electron, electron-vite, Preact, node-pty, Vitest, GitHub Actions',
    points: [
      '使用量を取得する公開 API がないため、Claude Code の CLI を疑似端末（node-pty）で裏で起動して /usage を送り、ローカルのキャッシュを更新させてから読む',
      '待機中はウィンドウを作らず、メモリの使用を抑えた',
    ],
  },
  {
    name: 'HitokoePet',
    repo: 'HitokoePet',
    summary: 'Claude Code のセッションの状態に反応して、作業の完了を声で知らせるデスクトップペット',
    role: '個人で開発（オープンソースの petdex を取り込み、機能を追加。Claude Code を使用）',
    background: '',
    learned: '',
    tech: 'Zig（Native SDK）, シェルスクリプト, Nix, GitHub Actions',
    points: [
      '複数のセッションを1匹にまとめて表示し、完了時の音声に合わせて口を動かす。待機中の CPU 使用を減らした',
      '音声通知は、macOS・Ubuntu・NixOS・Windows で使える再生コマンドを自動で選ぶ',
    ],
  },
]
