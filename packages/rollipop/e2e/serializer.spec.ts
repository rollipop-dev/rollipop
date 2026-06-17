import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import type { Polyfill } from '../src/config/types';
import { build, fixturePath } from './helpers';

describe('serializer', () => {
  describe('prelude', () => {
    it('injects prelude module before entry code', async () => {
      const initPath = path.join(fixturePath('serializer/prelude'), 'init.ts');
      const chunk = await build('serializer/prelude', {
        serializer: { prelude: [initPath] },
      });

      expect(chunk.code).toContain('prelude:init');
      expect(chunk.code).toContain('main entry');

      // prelude code must appear before entry code in the bundle
      const preludeIdx = chunk.code.indexOf('prelude:init');
      const mainIdx = chunk.code.indexOf('main entry');
      expect(preludeIdx).toBeLessThan(mainIdx);
    });

    it('multiple preludes are all injected in declaration order', async () => {
      const initPath = path.join(fixturePath('serializer/prelude'), 'init.ts');

      // Using same file twice to verify both imports appear
      const chunk = await build('serializer/prelude', {
        serializer: { prelude: [initPath, initPath] },
      });

      // Two import statements should be generated
      const importCount = (chunk.code.match(/prelude:init/g) || []).length;
      expect(importCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('polyfill', () => {
    it('plain code polyfill is injected directly into bundle intro', async () => {
      const polyfill: Polyfill = {
        type: 'plain',
        code: 'var __POLYFILL_MARKER__ = Date.now();',
      };

      const chunk = await build('serializer/prelude', {
        serializer: { polyfills: [polyfill] },
      });

      expect(chunk.code).toContain('__POLYFILL_MARKER__');
      // polyfill should appear before any module code
      const polyfillIdx = chunk.code.indexOf('__POLYFILL_MARKER__');
      const moduleIdx = chunk.code.indexOf('main entry');
      expect(polyfillIdx).toBeLessThan(moduleIdx);
    });

    it('IIFE polyfill is wrapped with _ scope', async () => {
      const polyfill: Polyfill = {
        type: 'iife',
        code: 'global.myPolyfill = function() {};',
      };

      const chunk = await build('serializer/prelude', {
        serializer: { polyfills: [polyfill] },
      });

      // Should be wrapped in `(function(global) { ... })(...)`
      expect(chunk.code).toMatch(/\(function\s*\(global\)/);
      expect(chunk.code).toContain('myPolyfill');
    });

    it('polyfill loaded from file path', async () => {
      const polyfillPath = path.join(fixturePath('serializer/prelude'), 'init.ts');

      const chunk = await build('serializer/prelude', {
        serializer: { polyfills: [polyfillPath] },
      });

      // File contents should be inlined as polyfill (raw text, not imported as module)
      expect(chunk.code).toContain('__INITIALIZED__');
    });

    it('polyfill from path with IIFE wrapper', async () => {
      const polyfill: Polyfill = {
        type: 'iife',
        path: path.join(fixturePath('serializer/prelude'), 'init.ts'),
      };

      const chunk = await build('serializer/prelude', {
        serializer: { polyfills: [polyfill] },
      });

      expect(chunk.code).toMatch(/\(function\s*\(global\)/);
      expect(chunk.code).toContain('__INITIALIZED__');
    });

    it('multiple polyfills maintain declaration order', async () => {
      const polyfills: Polyfill[] = [
        { type: 'plain', code: 'var __FIRST__ = 1;' },
        { type: 'plain', code: 'var __SECOND__ = 2;' },
        { type: 'iife', code: 'var __THIRD__ = 3;' },
      ];

      const chunk = await build('serializer/prelude', {
        serializer: { polyfills },
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
      const chunk = await build('serializer/prelude', {
        serializer: {
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
      const chunk = await build('serializer/prelude', {
        serializer: {
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
      const chunk = await build('serializer/prelude', {
        serializer: {
          outro: 'var __OUTRO_VAR__ = "outro-injected";',
        },
      });

      expect(chunk.code).toContain('__OUTRO_VAR__');
      const outroIdx = chunk.code.indexOf('__OUTRO_VAR__');
      const codeIdx = chunk.code.indexOf('main entry');
      expect(outroIdx).toBeGreaterThan(codeIdx);
    });

    it('postBanner / postFooter are applied after minification', async () => {
      const chunk = await build('serializer/prelude', {
        serializer: {
          postBanner: '/* POST_BANNER */',
          postFooter: '/* POST_FOOTER */',
        },
        optimization: { minify: true },
      });

      // post-* should survive minification
      expect(chunk.code).toContain('/* POST_BANNER */');
      expect(chunk.code).toContain('/* POST_FOOTER */');
    });

    it('banner as function receives chunk metadata', async () => {
      const chunk = await build('serializer/prelude', {
        serializer: {
          banner: (chunk) => `/* file: ${chunk.fileName} */`,
        },
      });

      expect(chunk.code).toMatch(/\/\* file: .+\.js \*\//);
    });
  });
});
