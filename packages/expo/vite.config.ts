import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    // Keep the implementation separate so the peer check runs before its runtime imports.
    entry: ['src/register.ts', 'src/adapter.ts', 'src/app.plugin.ts', 'src/updates-preload.ts'],
    outDir: 'dist',
    format: 'cjs',
    platform: 'node',
    unbundle: true,
    dts: true,
    // Expo config plugins and native resource preloads use synchronous require().
    checks: { legacyCjs: false },
  },
});
