import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/',
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || ''),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ''),
      'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || ''),
      'process.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'logo.png', 'og-logo.png'],
        manifest: {
          id: '/',
          name: 'قافلة القائم للحج والعمرة والزيارة',
          short_name: 'قافلة القائم',
          description: 'رفيقكم الموثوق في الرحلة الإيمانية — بوابة التسجيل والاستعلام والخدمات المتكاملة لضيوف الرحمن (موسم 1448هـ).',
          theme_color: '#0B1221',
          background_color: '#0B1221',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/favicon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
        },
      }),
      {
        name: 'disable-vite-client-ws',
        enforce: 'post',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs') || id.includes('@vite/client')) {
            return {
              code: code
                .replace(
                  'const createWebSocketModuleRunnerTransport = (options) => {',
                  'const createWebSocketModuleRunnerTransport = (options) => { return { async connect() {}, disconnect() {}, send() {} };'
                )
                .replace('setupForwardConsoleHandler(transport, forwardConsole);', '/* console forward disabled */'),
              map: null,
            };
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.'),
      },
    },
    server: {
      hmr: false,
      ws: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});


