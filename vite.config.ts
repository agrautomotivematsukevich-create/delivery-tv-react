import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Раскомментировано для корректной работы на GitHub Pages
      base: '/',
      server: {
        port: 5000,        // или 8080, 3001 и т.д.
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [
        react(),
        VitePWA({
          injectRegister: false,
          registerType: 'prompt',
          workbox: {
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/script\.google\.com\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 // match client cache TTL
                  },
                  cacheableResponse: {
                    statuses: [0, 200]
                  }
                }
              }
            ]
          },
          manifest: {
            name: 'AGR Warehouse',
            short_name: 'AGR',
            description: 'Терминал управления складом',
            theme_color: '#191B25',
            background_color: '#0F0F12',
            display: 'standalone',
            orientation: 'portrait',
            icons: [
              { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      esbuild: {
        drop: mode === 'production' ? ['console', 'debugger'] : []
      }
    };
});
