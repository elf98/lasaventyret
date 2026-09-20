import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import os from 'node:os'
import path from 'node:path'
import { recordingUpload } from './scripts/recording-upload'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Tar emot inspelningar från föräldravyn i dev och skriver dem till public/recorded/ (samma
    // adress som upload-recording.php på servern), så att en inspelning på datorn följer med i deployen.
    recordingUpload(),
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
        // Ljudet ligger inte i precachen: det hämtas med ?v=<hash> ur manifestet och cachas
        // vid första uppspelningen, så omgenererade ljud når iPaden utan att cachen rensas.
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        globIgnores: ['**/audio/manifest.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Även klippta bokstavsljud (.wav) och egna inspelningar (recorded/), annars saknas de offline.
            urlPattern: ({ url }) => (url.pathname.includes('/audio/') || url.pathname.includes('/recorded/')) && /\.(mp3|wav)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'lasaventyret-audio', expiration: { maxEntries: 800, maxAgeSeconds: 365 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  // Dropbox låser filer i node_modules/.vite; lägg Vites cache utanför.
  cacheDir: path.join(os.tmpdir(), 'lasaventyret-vite'),
  server: { port: 5180 },
})
