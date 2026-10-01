import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    entry: ['src/index.ts', 'src/transformer.ts', 'src/mock.ts'],
    outDir: 'dist',
    format: 'cjs',
    platform: 'node',
    fixedExtension: false,
    dts: true,
  },
});
