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
        // サイト全体で唯一のアクセントカラー(Heroタイトルと同系のピンク)。
        // 実体はindex.cssの--color-accentで、テーマごとに濃さが変わる
        // (淡黄と近黒の両方で3:1を満たす単一色が存在しないため。詳細はindex.css)。
        // 不透明度修飾子(bg-accent/25 等)を効かせるため<alpha-value>形式にする。
        'accent': 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-dim': 'rgb(var(--color-accent) / 0.14)',
        // accent塗りの上に乗せる文字色。accentがテーマで変わるのでこれも追従する。
        'on-accent': 'rgb(var(--color-on-accent) / <alpha-value>)',
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
      keyframes: {
        // 次の質問・推測が現れるときの入場。動きは最小限(6px)にとどめる。
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        // 「考え中」インジケータの明滅。animate-pulseより振れ幅を抑えている。
        'think': {
          '0%, 100%': { opacity: '0.25', transform: 'scaleY(1)' },
          '50%': { opacity: '1', transform: 'scaleY(1.6)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 260ms ease-out both',
        'think': 'think 900ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
