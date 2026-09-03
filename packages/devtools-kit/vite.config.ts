import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: 'src/node.ts',
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    dts: true,
  },
  test: {
    coverage: {
      include: ['src/**'],
      exclude: ['**/dist/**', '**/__tests__/**', '**/*.spec.ts'],
    },
  },
});
