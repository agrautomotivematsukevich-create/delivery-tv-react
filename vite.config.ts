import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/',
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          // === ДОБАВЛЕН БЛОК АГРЕССИВНОГО ОБНОВЛЕНИЯ ===
          workbox: {
            cleanupOutdatedCaches: true, // Жестко удаляет старые версии файлов
            clientsClaim: true,          // Забирает контроль над страницей сразу
            skipWaiting: true            // Применяет обновление без ожидания закрытия вкладки
          },
          manifest: {
            name: 'AGR Warehouse',
            short_name: 'AGR',
            description: 'Терминал управления складом',
            theme_color: '#191B25',
            background_color: '#0F0F12',
            display: 'standalone',
            orientation: 'portrait'
            // Позже мы добавим сюда блок icons для иконок на рабочем столе
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