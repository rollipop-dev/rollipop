import { describe, expect, it } from 'vite-plus/test';

import { build } from './helpers';

describe('optimization', () => {
  describe('treeshake', () => {
    it('removes unused exports when enabled (default)', async () => {
      const chunk = await build('optimization/treeshake');

      expect(chunk.code).toContain('add');
      expect(chunk.code).not.toContain('unusedMultiply');
      expect(chunk.code).not.toContain('unusedSubtract');
    });

    it('preserves all exports when disabled', async () => {
      const chunk = await build('optimization/treeshake', {
        treeshake: false,
      });

      expect(chunk.code).toContain('add');
      expect(chunk.code).toContain('unusedMultiply');
      expect(chunk.code).toContain('unusedSubtract');
    });
  });

  describe('minify', () => {
    it('minify: false preserves readable output', async () => {
      const chunk = await build('optimization/treeshake', {
        output: { minify: false },
      });

      // Non-minified output should have meaningful whitespace
      expect(chunk.code).toContain('\n');
      expect(chunk.code).toContain('add');
    });

    it('minify: true compresses output', async () => {
      const unminified = await build('optimization/treeshake', {}, { minify: false });
      const minified = await build('optimization/treeshake', {}, { minify: true });

      // Minified should be significantly smaller
      expect(minified.code.length).toBeLessThan(unminified.code.length);
      // But still functionally equivalent (function name may be mangled)
      expect(minified.code).toMatch(/\+/); // a + b operation preserved
    });

    it('minify: "dce-only" removes dead code without compressing', async () => {
      const dceOnly = await build('optimization/treeshake', {}, { minify: 'dce-only' });
      const full = await build('optimization/treeshake', {}, { minify: true });

      // DCE-only keeps readable names, full minify mangles them
      expect(dceOnly.code.length).toBeGreaterThanOrEqual(full.code.length);
      // DCE-only should still have readable identifiers
      expect(dceOnly.code).toContain('add');
    });
  });

  describe('minify options object', () => {
    it('minify with compress.dropConsole removes console.log', async () => {
      const chunk = await build(
        'optimization/treeshake',
        {},
        {
          minify: { compress: { dropConsole: true } },
        },
      );

      expect(chunk.code).not.toContain('console.log');
    });
  });

  describe('mode affects optimization defaults', () => {
    it('production mode has treeshake enabled by default', async () => {
      const chunk = await build('optimization/treeshake', { mode: 'production' });

      expect(chunk.code).not.toContain('unusedMultiply');
    });

    it('buildOptions.minify overrides config.output.minify', async () => {
      // Config says minify: true, but buildOptions says false
      const chunk = await build(
        'optimization/treeshake',
        { output: { minify: true } },
        { minify: false },
      );

      // buildOptions.minify wins — output should be readable
      expect(chunk.code).toContain('add');
      expect(chunk.code).toContain('\n');
    });
  });
});
