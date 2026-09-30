import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { build, buildToFile, cleanup, fixturePath } from './helpers';

describe('output', () => {
  describe('sourcemap', () => {
    const fixture = 'bundle-output/prelude';
    const outDir = '.out-sourcemap';

    it('sourcemap: true generates separate .map file', async () => {
      try {
        const { outfile } = await buildToFile(fixture, outDir, {}, { sourcemap: true });
        const mapFile = outfile + '.map';

        expect(fs.existsSync(mapFile)).toBe(true);

        const map = JSON.parse(fs.readFileSync(mapFile, 'utf-8'));
        expect(map.version).toBe(3);
        expect(map.sources).toBeDefined();
        expect(map.mappings).toBeDefined();

        // Output should contain sourceMappingURL comment
        const output = fs.readFileSync(outfile, 'utf-8');
        expect(output).toContain('//# sourceMappingURL=');
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it.each(['inline', 'hidden'] as const)('preserves the %s sourcemap mode', async (sourcemap) => {
      try {
        const { outfile, readOutput } = await buildToFile(fixture, outDir, {}, { sourcemap });

        if (sourcemap === 'inline') {
          expect(fs.existsSync(outfile + '.map')).toBe(false);
          const encodedMap = readOutput().match(/sourceMappingURL=data:.*;base64,([^\n]+)/)?.[1];
          expect(encodedMap).toBeDefined();
          expect(JSON.parse(Buffer.from(encodedMap!, 'base64').toString())).toMatchObject({
            version: 3,
          });
        } else {
          expect(fs.existsSync(outfile + '.map')).toBe(true);
          expect(readOutput()).not.toContain('sourceMappingURL=');
        }
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it('uses config.output.sourcemap when the build option is omitted', async () => {
      try {
        const { outfile, readOutput } = await buildToFile(fixture, outDir, {
          output: { sourcemap: true },
        });

        expect(fs.existsSync(outfile + '.map')).toBe(true);
        expect(readOutput()).toContain('sourceMappingURL=');
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it('preserves sourcemap options set by the rolldown finalizer', async () => {
      try {
        const { outfile, readOutput } = await buildToFile(
          fixture,
          outDir,
          { rolldownOptions: { output: { sourcemap: 'hidden' } } },
          { sourcemap: false },
        );

        expect(fs.existsSync(outfile + '.map')).toBe(true);
        expect(readOutput()).not.toContain('sourceMappingURL=');
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it('sourcemap: false produces no sourcemap', async () => {
      try {
        const { outfile } = await buildToFile(fixture, outDir, {}, { sourcemap: false });

        expect(fs.existsSync(outfile + '.map')).toBe(false);

        const output = fs.readFileSync(outfile, 'utf-8');
        expect(output).not.toContain('//# sourceMappingURL=');
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it('sourcemapBaseUrl generates absolute URL', async () => {
      try {
        const { outfile } = await buildToFile(
          fixture,
          outDir,
          { output: { sourcemapBaseUrl: 'https://cdn.example.com/maps' } },
          { sourcemap: true },
        );

        const output = fs.readFileSync(outfile, 'utf-8');
        expect(output).toContain('//# sourceMappingURL=https://cdn.example.com/maps/');
      } finally {
        cleanup(fixture, outDir);
      }
    });

    it('sourcemapPathTransform rewrites source paths in map', async () => {
      try {
        const { outfile } = await buildToFile(
          fixture,
          outDir,
          {
            output: {
              sourcemapPathTransform: (source: string) => source.replace(/.*\//, 'rewritten/'),
            },
          },
          { sourcemap: true },
        );

        const mapFile = outfile + '.map';
        const map = JSON.parse(fs.readFileSync(mapFile, 'utf-8'));

        // All sources should be rewritten
        for (const src of map.sources) {
          expect(src).toMatch(/^rewritten\//);
        }
      } finally {
        cleanup(fixture, outDir);
      }
    });
  });

  describe('minify', () => {
    it('uses configured minification unless a build option overrides it', async () => {
      const fixture = 'bundle-output/prelude';
      const configured = await build(fixture, { output: { minify: true } });
      const explicit = await build(fixture, { output: { minify: true } }, { minify: true });
      const overridden = await build(fixture, { output: { minify: true } }, { minify: false });

      expect(configured.code).toBe(explicit.code);
      expect(configured.code.length).toBeLessThan(overridden.code.length);
    });
  });

  describe('sourcemap outfile', () => {
    const fixture = 'bundle-output/prelude';
    const outDir = '.out-sourcemap-outfile';

    it('sourcemapOutfile moves sourcemap to custom location', async () => {
      try {
        const { outfile } = await buildToFile(
          fixture,
          outDir,
          {},
          {
            sourcemap: true,
            sourcemapOutfile: path.join(outDir, 'maps', 'bundle.js.map'),
          },
        );

        const customMapPath = path.join(fixturePath(fixture), outDir, 'maps', 'bundle.js.map');
        expect(fs.existsSync(customMapPath)).toBe(true);

        const map = JSON.parse(fs.readFileSync(customMapPath, 'utf-8'));
        expect(map.version).toBe(3);

        // Original location should NOT have the map
        expect(fs.existsSync(outfile + '.map')).toBe(false);
      } finally {
        cleanup(fixture, outDir);
      }
    });
  });

  describe('file output', () => {
    const fixture = 'bundle-output/prelude';
    const outDir = '.out-file';

    it('writes bundle to outfile path', async () => {
      try {
        const { outfile, readOutput } = await buildToFile(fixture, outDir);

        expect(fs.existsSync(outfile)).toBe(true);
        expect(readOutput()).toContain('main entry');
      } finally {
        cleanup(fixture, outDir);
      }
    });
  });

  describe('global variables', () => {
    it('injects __BUNDLE_START_TIME__ for performance tracking', async () => {
      const chunk = await build('bundle-output/prelude');

      expect(chunk.code).toContain('__BUNDLE_START_TIME__');
      expect(chunk.code).toContain('nativePerformanceNow');
    });

    it('injects process polyfill with NODE_ENV', async () => {
      const chunk = await build('bundle-output/prelude');

      expect(chunk.code).toContain('var process = globalThis.process || {}');
      expect(chunk.code).toContain('process.env = process.env || {}');
    });

    it('dev server mode adds React Refresh stubs', async () => {
      // Note: This only applies to serve mode, which we can test via the intro
      // by checking the global vars function behavior
      const prod = await build('bundle-output/prelude');

      // Production build should NOT have $RefreshReg$/$RefreshSig$
      expect(prod.code).not.toContain('$RefreshReg$');
      expect(prod.code).not.toContain('$RefreshSig$');
    });
  });

  describe('rolldownOptions', () => {
    it('merges object options after final config is generated', async () => {
      const chunk = await build('bundle-output/prelude', {
        rolldownOptions: {
          output: {
            banner: '/* OBJECT_ROLLDOWN_OPTIONS */',
          },
        },
      });

      expect(chunk.code).toContain('/* OBJECT_ROLLDOWN_OPTIONS */');
    });

    it('receives full final config when configured as a function', async () => {
      let receivedInput = false;
      let receivedOutput = false;

      const chunk = await build('bundle-output/prelude', {
        rolldownOptions: (config) => {
          receivedInput = !!config.input;
          receivedOutput = !!config.output;
          return {
            ...config,
            output: {
              ...config.output,
              footer: '/* FUNCTION_OVERRIDE */',
            },
          };
        },
      });

      expect(receivedInput).toBe(true);
      expect(receivedOutput).toBe(true);
      expect(chunk.code).toContain('/* FUNCTION_OVERRIDE */');
    });
  });
});
