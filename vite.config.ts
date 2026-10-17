import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,otf,ttf,woff2}']
      },
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'fonts/*'],
      manifest: {
        name: 'MegaEBD - Gerador de Slides para EBD',
        short_name: 'MegaEBD',
        description: 'Gerador inteligente de apresentações e slides para a Escola Bíblica Dominical',
        theme_color: '#0d2238',
        background_color: '#0d2238',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('jspdf') || id.includes('pptxgenjs') || id.includes('jszip')) return 'vendor-export';
          if (id.includes('lucide-react') || id.includes('lz-string') || id.includes('canvas-confetti')) return 'vendor-ui';
        }
      }
    }
  },
  optimizeDeps: {
    include: ['pptxgenjs', 'jszip']
  },
  server: {
    port: 3000,
    open: true
  }
});
