/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'rich-black': '#0A0E27',
        'deep-navy': '#151B36',
        'accent-cyan': '#00D9FF',
        'accent-violet': '#8B5CF6',
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        'display': ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'hero': ['clamp(3rem, 15vw, 12rem)', { lineHeight: '0.9', letterSpacing: '-0.04em' }],
        'massive': ['clamp(2rem, 8vw, 6rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
}
