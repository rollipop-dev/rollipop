import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rollipopDevServerTarget =
  process.env.ROLLIPOP_DEV_SERVER_PROXY_TARGET ??
  process.env.ROLLIPOP_API_PROXY_TARGET ??
  'http://127.0.0.1:8081';

const mockEnabled = process.env.MOCK === '1';

if (mockEnabled) {
  console.log('[dev] API mocking enabled');
}

export default defineConfig({
  base: '/dashboard/',
  define: {
    __ROLLIPOP_MOCK__: JSON.stringify(mockEnabled),
  },
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        app: path.resolve(import.meta.dirname, 'index.html'),
        notFound: path.resolve(import.meta.dirname, '404.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: mockEnabled
      ? undefined
      : {
          '/api': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
            ws: true,
          },
          '/sse': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
          },
          '/symbolicate': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
          },
          '^/dashboard/analyze-report/.*\\.html$': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
          },
          '^/.*\\.bundle(?:\\?.*)?$': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
          },
          '^/.*\\.map(?:\\?.*)?$': {
            target: rollipopDevServerTarget,
            changeOrigin: true,
            secure: false,
          },
        },
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
