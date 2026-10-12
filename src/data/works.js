// /career/ のプロジェクト。
// points(工夫)・background(作った経緯)・learned(学び)は、決まった文だけ出す(空なら行を出さない)。
// draft はまだ決まっていない文で、/career/?drafts のときだけ points・background・learned の代わりに出す
// (確認シート16回目に本人が書いたメモを、1つ3行までに縮めた下書き。確認シート17回目で確かめる)。
// shots: 実際に動いている画面のスクショ(public/career/works/)。何枚でも置ける。どれも同じ高さにそろえ、押すと full を大きく出す。
// このサイトは画面を載せても意味が無いので、画像なし(確認シート14回目)。
// 担当は作品ごとに Claude Code と書かず、プロジェクトの見出しの下に1行でまとめる(R16-36。WORKS_NOTE)。

// 下書き(確認シート17回目)。R16-36 の「まとめてClaude Codeを使用した…(ほとんど実装にClaude Codeを使用した、とか)」から
export const WORKS_NOTE = 'どの作品も、実装のほとんどに Claude Code を使っています。'

export const works = [
  {
    name: 'このサイト',
    repo: 'terasaki-8910.github.io',
    summary: '作ったアプリや実験を載せている個人サイト（このページもその一部）',
    role: '個人で設計・実装・運用',
    background: '',
    learned: '',
    tech: 'React 18, Vite 5, Tailwind CSS 3, GSAP, three.js, GitHub Actions, GitHub Pages',
    points: [
      'Spotify・Steam・GitHub のデータを GitHub Actions で定期的に取得し（Spotify と Steam は6時間ごと、GitHub は1日1回）、静的サイトのまま更新',
    ],
    draft: {
      points: [
        'Spotify・Steam・GitHub・Trakt のデータを GitHub Actions で定期的に取り込み、サーバーを持たずに更新しています。',
        '背景のマス目・色・書体をページの間でそろえ、どのページも同じサイトだと分かるようにしました。',
        'つくば市のオープンデータから、ごみ収集日のカレンダーを作りました。',
      ],
      background:
        'TA で学生が自分の Web アプリを作るのを見て、自分も作って公開したいと思ったのがきっかけです。自分用のメモ置き場も兼ねています。2025年10月に素の HTML/CSS で作り始め、2026年7月に作り直して、実際のデータを見せる構成にしました。',
      learned:
        'GitHub Secrets での秘密情報の扱い、GitHub Actions での定期的な処理、React、スマホにも合わせたデザインを学びました。',
    },
  },
  {
    name: 'happydeck',
    repo: 'happydeck',
    summary: '複数のマシンで動いている Claude Code のセッションを、1つの画面で見て操作するデスクトップアプリ（Happy 経由）',
    role: '個人で設計・実装',
    // 1つのセッションを大きく出した画面(確認シート14回目 R14-33)
    shots: [{ src: '/career/works/happydeck.webp', full: '/career/works/happydeck-full.webp', width: 640, height: 400, alt: 'happydeck の画面（モックデータで、1つのセッションを大きく出したところ）' }],
    background: '',
    learned: '',
    tech: 'TypeScript, React 19, Vite, Tauri v2, Zod, Vitest, GitHub Actions',
    points: [
      'Happy の通信（端末の紐づけ、エンドツーエンド暗号、同期）を扱うクライアントを、公式のコードを使わずに TypeScript で実装し、画面とは別にテストを付けた',
      '本物のアカウントやマシンに触らずに画面を作れる、モックデータのモードを用意した',
    ],
    draft: {
      points: [
        'Happy の通信（端末の紐づけ・暗号・同期）を扱う部分を、公式のコードを読んで仕様を書き起こし、TypeScript で作り直しました。',
        '画面を自由に分割して、複数のマシンのセッションを並べて操作できます。分割の形は自分で組めます。',
        '止まっているセッションにメッセージを送ると自動で再開し、確認待ちの質問にも画面から答えられます。',
        '状態や権限の危険度を色で区別し、一覧で「何をしているか」が先に目に入るようにしました。',
      ],
      background:
        'Tailscale でつないだ4台のマシンの Claude Code を、1つの画面で見て作業も振りたかったのがきっかけです。既存の仕組みを調べ、Happy の中継はそのまま使い、足りない PC 向けの画面だけを Tauri で作りました（メモリは目標500MB以下に対し、実測200MB以下）。',
      learned:
        'AI に任せるときは参考の画像や手本のアプリを添えて具体的に伝えること、報告をうのみにせず実機で確かめることを学びました。',
    },
  },
  {
    name: 'voice-transcript',
    repo: 'voice-transcript',
    summary: 'Groq の Whisper API で音声を文字起こしする、CLI とデスクトップアプリ',
    role: '個人で設計・実装',
    shots: [{ src: '/career/works/voice-transcript.webp', full: '/career/works/voice-transcript-full.webp', width: 601, height: 400, alt: 'voice-transcript の履歴の画面' }],
    background: '',
    learned: '',
    tech: 'TypeScript, React 19, Vite, Tauri v2, PostgreSQL, Drizzle ORM, ffmpeg, Vitest',
    points: [
      '無音の位置で音声を分割して文字起こしし、つなぎ直すことで、1時間を超える音声も扱える',
      'CLI とデスクトップアプリで同じエンジンを共有し、ffmpeg・API 呼び出し・DB などの特権操作は Rust 側に集めた',
    ],
    draft: {
      points: [
        '無音の位置で音声を分割してからつなぎ直し、1時間を超える音声も文字起こしできるようにしました。',
        '授業を録るために、システム音声とマイクの同時録音と、無音が続いたときの自動停止を足しました。',
        '聞き間違いを直す注釈と辞書を分け、元の文字起こしを残したまま、次回からの精度を上げられるようにしました。',
      ],
      background:
        '1時間を超える授業の音声を文字起こしするために、CLI として作り始めました。使いながらデスクトップアプリ・履歴・録音・辞書・注釈・検索を足し、Mac と Windows で同じ履歴を使えるよう自宅のサーバーに置きました。',
      learned:
        '長い処理の異常はその場で知らせること、API キーを画面の側に持たせない設計を学びました。用語があいまいだと AI が意図と違う実装をするので、アプリの中の言葉で具体的に伝えることも学びました。',
    },
  },
  {
    name: 'claude-usage-tray（UsageTray）',
    repo: 'claude-usage-tray',
    summary: 'Claude の使用量（5時間のセッション枠と週の枠）を、タスクトレイとメニューバーに常に表示するデスクトップアプリ',
    role: '個人で設計・実装・配布（Windows / macOS）',
    shots: [{ src: '/career/works/claude-usage-tray.webp', full: '/career/works/claude-usage-tray-full.webp', width: 304, height: 367, alt: 'UsageTray のポップアップ（使用量の表示）' }],
    background: '',
    learned: '',
    tech: 'TypeScript, Electron, electron-vite, Preact, node-pty, Vitest, GitHub Actions',
    points: [
      '使用量を取得する公開 API がないため、Claude Code の CLI を疑似端末（node-pty）で裏で起動して /usage を送り、ローカルのキャッシュを更新させてから読む',
      '待機中はウィンドウを作らず、メモリの使用を抑えた',
    ],
    draft: {
      points: [
        '使用量を取る公開 API がないため、Claude Code を裏で起動して /usage を送り、キャッシュを更新させてから読んでいます。',
        '確認（無料）と送信（有料）を分け、送信は枠が切れたときだけにして、1回あたり約 $0.0016 に抑えました。',
        '16×16 のトレイアイコンでも読めるよう、数字を専用のドット文字で描きました。',
      ],
      background:
        '使用量を見ながら、モデルの切り替えや並列での作業を判断したかったのがきっかけです。5時間の枠が後ろにずれていくのを防ぐため、枠が切れた瞬間に最小のコストで次の枠を始める機能も付けました。',
      learned:
        '「動いているように見える」ことと「正しく動いている」ことは別で、重大な不具合の多くは実際に触って見つかりました。仕様が公開されていない部分は、推測せず実験で確かめることを学びました。',
    },
  },
  {
    name: 'HitokoePet',
    repo: 'HitokoePet',
    summary: 'Claude Code のセッションの状態に反応して、作業の完了を声で知らせるデスクトップペット',
    role: '個人で開発（オープンソースの petdex を取り込み、機能を追加）',
    background: '',
    learned: '',
    tech: 'Zig（Native SDK）, シェルスクリプト, Nix, GitHub Actions',
    points: [
      '複数のセッションを1匹にまとめて表示し、完了時の音声に合わせて口を動かす。待機中の CPU 使用を減らした',
      '音声通知は、macOS・Ubuntu・NixOS・Windows で使える再生コマンドを自動で選ぶ',
    ],
    draft: {
      points: [
        '複数のセッションを1匹にまとめ、確認待ち・指示の直後・失敗のときだけ声で知らせます（60秒のクールダウン付き）。',
        '吹き出しを押すと、そのセッションが動いている端末を前面に出します。',
        'Windows と WSL の Claude Code を同時に見張れるようにしました。',
      ],
      background:
        '複数のプロジェクトで Claude Code を並行して動かすと、終わったものや確認待ちで止まったものを見落とすため作りました。既存の3つの実装を比べ、足りなかった複数セッションへの対応を、MIT ライセンスの petdex をフォークして足しました。',
      learned:
        'AI が「素材が悪い」で止まったとき、別のビューアと比べて本当の原因（縮小表示のやり方）を突き止めました。比較の相手を用意して切り分ける大切さを学びました。',
    },
  },
]
