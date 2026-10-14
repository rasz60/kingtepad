import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: '업무 일지',
        short_name: '업무일지',
        description: '개인 업무 일지',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#f0f0f0',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Supabase API 응답은 캐시하지 않음 (항상 최신 데이터)
        navigateFallbackDenylist: [/^\/api\//],
        // 웹 푸시 수신 핸들러 (public/push-sw.js)
        importScripts: ['push-sw.js'],
        // 픽셀 폰트는 처음 쓸 때 캐시 (오프라인에서도 폰트 유지)
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
});
