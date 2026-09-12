import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Custom sw.ts (Batch mode's Background Sync handler — see
      // coin_app_requirements.md §5.6) instead of the generated default,
      // so injectManifest replaces generateSW here.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // The background-removal library's onnxruntime WASM runtime is
        // 20MB+ — far past workbox's default 2MB precache limit, and not
        // worth precaching at install time anyway (it's fetched lazily the
        // first time a photo is captured).
        globIgnores: ['**/ort*.{wasm,mjs,js}'],
      },
      manifest: {
        name: 'Numismatica',
        short_name: 'Numismatica',
        description: 'Personal coin scanner and collection tracker',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
