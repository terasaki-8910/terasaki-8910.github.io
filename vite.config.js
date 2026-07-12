import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // GitHub Pages用に相対パスを使用
  build: {
    outDir: 'docs',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      external: [],
      input: {
        main: resolve(__dirname, 'index.html'),
        ascii: resolve(__dirname, 'ascii/index.html'),
        spotify: resolve(__dirname, 'spotify/index.html'),
      },
      output: {
        manualChunks: undefined,
      }
    }
  }
})
