import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    entry: 'src/index.ts',
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    dts: true,
    checks: {
      pluginTimings: false,
    },
  },
});
