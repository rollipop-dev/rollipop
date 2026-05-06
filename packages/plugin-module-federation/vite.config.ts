import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';

const commonPackConfig: PackUserConfig = {
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: true,
};

export default defineConfig({
  pack: [
    { ...commonPackConfig, entry: 'src/index.ts' },
    { ...commonPackConfig, entry: 'src/runtime.ts' },
  ],
  test: {
    coverage: {
      include: ['src/**'],
      exclude: ['**/dist/**', '**/__tests__/**', '**/*.spec.ts'],
    },
  },
});
