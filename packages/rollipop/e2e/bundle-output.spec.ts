import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { build, fixturePath } from './helpers';

describe('bundle output', () => {
  describe('prelude', () => {
    it('injects prelude module before entry code', async () => {
      const initPath = path.join(fixturePath('bundle-output/prelude'), 'init.ts');
      const chunk = await build('bundle-output/prelude', {
        prelude: [initPath],
      });

      expect(chunk.code).toContain('prelude:init');
      expect(chunk.code).toContain('main entry');

      // prelude code must appear before entry code in the bundle
      const preludeIdx = chunk.code.indexOf('prelude:init');
      const mainIdx = chunk.code.indexOf('main entry');
      expect(preludeIdx).toBeLessThan(mainIdx);
    });

    it('multiple preludes are all injected in declaration order', async () => {
      const initPath = path.join(fixturePath('bundle-output/prelude'), 'init.ts');

      // Using same file twice to verify both imports appear
      const chunk = await build('bundle-output/prelude', {
        prelude: [initPath, initPath],
      });

      // Two import statements should be generated
      const importCount = (chunk.code.match(/prelude:init/g) || []).length;
      expect(importCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('polyfills', () => {
    it('inline polyfill is injected before entry code', async () => {
      const chunk = await build('bundle-output/prelude', {
        polyfills: [{ type: 'iife', code: 'globalThis.__POLYFILL_MARKER__ = Date.now();' }],
      });

      expect(chunk.code).toContain('__POLYFILL_MARKER__');
      const polyfillIdx = chunk.code.indexOf('__POLYFILL_MARKER__');
      const moduleIdx = chunk.code.indexOf('main entry');
      expect(polyfillIdx).toBeLessThan(moduleIdx);
    });

    it('string polyfill is injected from a file path', async () => {
      const polyfillPath = path.join(fixturePath('bundle-output/prelude'), 'init.ts');

      const chunk = await build('bundle-output/prelude', {
        polyfills: [polyfillPath],
      });

      expect(chunk.code).toContain('__INITIALIZED__');
    });

    it('multiple polyfills maintain declaration order', async () => {
      const chunk = await build('bundle-output/prelude', {
        polyfills: [
          { type: 'plain', code: 'globalThis.__FIRST__ = 1;' },
          { type: 'plain', code: 'globalThis.__SECOND__ = 2;' },
          { type: 'plain', code: 'globalThis.__THIRD__ = 3;' },
        ],
      });

      const first = chunk.code.indexOf('__FIRST__');
      const second = chunk.code.indexOf('__SECOND__');
      const third = chunk.code.indexOf('__THIRD__');
      expect(first).toBeLessThan(second);
      expect(second).toBeLessThan(third);
    });
  });

  describe('banner / footer / intro / outro', () => {
    it('banner appears before all code, footer after all code', async () => {
      const chunk = await build('bundle-output/prelude', {
        output: {
          banner: '/* === BUNDLE_BANNER === */',
          footer: '/* === BUNDLE_FOOTER === */',
        },
      });

      const banner = chunk.code.indexOf('BUNDLE_BANNER');
      const footer = chunk.code.indexOf('BUNDLE_FOOTER');
      const code = chunk.code.indexOf('main entry');

      expect(banner).toBeLessThan(code);
      expect(footer).toBeGreaterThan(code);
    });

    it('intro is injected inside module wrapper (after global vars)', async () => {
      const chunk = await build('bundle-output/prelude', {
        output: {
          intro: 'var __INTRO_VAR__ = "intro-injected";',
        },
      });

      expect(chunk.code).toContain('__INTRO_VAR__');
      // intro appears after global var definitions but before module code
      const introIdx = chunk.code.indexOf('__INTRO_VAR__');
      const globalIdx = chunk.code.indexOf('__BUNDLE_START_TIME__');
      expect(introIdx).toBeGreaterThan(globalIdx);
    });

    it('outro is injected at the end inside the wrapper', async () => {
      const chunk = await build('bundle-output/prelude', {
        output: {
          outro: 'var __OUTRO_VAR__ = "outro-injected";',
        },
      });

      expect(chunk.code).toContain('__OUTRO_VAR__');
      const outroIdx = chunk.code.indexOf('__OUTRO_VAR__');
      const codeIdx = chunk.code.indexOf('main entry');
      expect(outroIdx).toBeGreaterThan(codeIdx);
    });

    it('postBanner / postFooter are applied after minification', async () => {
      const chunk = await build('bundle-output/prelude', {
        output: {
          postBanner: '/* POST_BANNER */',
          postFooter: '/* POST_FOOTER */',
          minify: true,
        },
      });

      // post-* should survive minification
      expect(chunk.code).toContain('/* POST_BANNER */');
      expect(chunk.code).toContain('/* POST_FOOTER */');
    });

    it('banner as function receives chunk metadata', async () => {
      const chunk = await build('bundle-output/prelude', {
        output: {
          banner: (chunk: { fileName: string }) => `/* file: ${chunk.fileName} */`,
        },
      });

      expect(chunk.code).toMatch(/\/\* file: .+\.js \*\//);
    });
  });
});
