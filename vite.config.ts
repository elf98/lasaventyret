import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Läsäventyret',
        short_name: 'Läsäventyret',
        description: 'Lär dig läsa svenska med rymdraketer och racerbilar',
        lang: 'sv',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#0b1026',
        theme_color: '#0b1026',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  // Dropbox låser filer i node_modules/.vite; lägg Vites cache utanför.
  cacheDir: path.join(os.tmpdir(), 'lasaventyret-vite'),
  server: { port: 5180 },
})
