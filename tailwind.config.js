/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // CSS変数経由(index.cssの:rootと@media (prefers-color-scheme: dark)で
        // 値を定義)。ライト/ダーク切り替えで全コンポーネントの配色が自動追従する。
        'paper': 'var(--color-paper)',
        'surface': 'var(--color-surface)',
        'ink': 'var(--color-ink)',
        'muted': 'var(--color-muted)',
        'line': 'var(--color-line)',
        // サイト全体で唯一のアクセントカラー(チェレステグリーン近似)。
        // 明暗どちらの地でも視認性を保つため両テーマ共通の固定値。
        'celeste': '#7FBEA0',
        'celeste-dim': 'rgba(127, 190, 160, 0.14)',
      },
      fontFamily: {
        'sans': ['"Zen Kurenaido"', '"Hiragino Kaku Gothic ProN"', '"Hiragino Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        'display': ['"Craft Mincho"', '"Hiragino Mincho ProN"', '"Yu Mincho"', 'serif'],
        'mono': ['"Fira Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'hero': ['clamp(3rem, 15vw, 12rem)', { lineHeight: '0.9', letterSpacing: '-0.04em' }],
        'massive': ['clamp(2rem, 8vw, 6rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
}
