import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  publicDir: '../public',
  envDir: '..',
  base: './',
  plugins: [react(), tailwind(), VitePWA({
    registerType: 'autoUpdate',
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{html,css,js,png,svg,webmanifest,woff2}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true
    }
  })],
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/database'], motion: ['motion/react'], storage: ['dexie'] } } } }
})
