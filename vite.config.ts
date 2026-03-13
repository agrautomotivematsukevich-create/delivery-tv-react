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
          registerType: 'autoUpdate',
          manifest: {
            name: 'AGR Warehouse',
            short_name: 'AGR',
            description: 'Терминал управления складом',
            theme_color: '#191B25',
            background_color: '#0F0F12',
            display: 'standalone',
            orientation: 'portrait'
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
