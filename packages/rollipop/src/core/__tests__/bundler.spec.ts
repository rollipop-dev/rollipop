import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { FileStorage } from '../../storage/file-storage';
import { createTestConfig } from '../../testing/config';
import { Bundler } from '../bundler';

describe('Bundler', () => {
  beforeEach(() => {
    // Each test uses a separate temporary project root.
    Reflect.set(FileStorage, 'instance', null);
  });

  it.each([
    { sourcemap: true as const, baseUrl: undefined },
    { sourcemap: 'hidden' as const, baseUrl: undefined },
    { sourcemap: true as const, baseUrl: 'https://cdn.example/bundles/' },
  ])('keeps a custom sourcemap destination consistent: %j', async ({ sourcemap, baseUrl }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-sourcemap-'));
    const config = createTestConfig(root);
    config.mode = 'production';
    config.entry = path.join(root, 'entry.js');
    config.prelude = [];
    config.polyfills = [];
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(process.cwd(), 'package.json');
    config.output = { sourcemap, sourcemapBaseUrl: baseUrl };

    try {
      fs.writeFileSync(config.entry, 'globalThis.value = "custom-map";');
      const chunk = await new Bundler(config).build({
        platform: 'ios',
        outfile: 'dist/app.bundle',
        sourcemapOutfile: 'maps/custom map#1.map',
        cache: false,
      });
      const code = fs.readFileSync(path.join(root, 'dist/app.bundle'), 'utf-8');
      const map = JSON.parse(fs.readFileSync(path.join(root, 'maps/custom map#1.map'), 'utf-8'));

      expect(code).toBe(chunk.code);
      expect(chunk.sourcemapFileName).toBe('../maps/custom map#1.map');
      expect(map.sourcesContent).toContain('globalThis.value = "custom-map";');
      expect(fs.existsSync(path.join(root, 'dist/app.bundle.map'))).toBe(false);
      if (sourcemap === 'hidden') {
        expect(code).not.toContain('sourceMappingURL=');
      } else {
        const url = code.match(/\/\/# sourceMappingURL=(.+)$/)?.[1];
        expect(url).toBe(
          baseUrl
            ? 'https://cdn.example/maps/custom%20map%231.map'
            : '../maps/custom%20map%231.map',
        );
        if (!baseUrl) {
          expect(fs.existsSync(path.resolve(root, 'dist', decodeURIComponent(url!)))).toBe(true);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the current entry and output path for consecutive builds', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-build-state-'));
    const config = createTestConfig(root);
    config.mode = 'production';
    config.prelude = [];
    config.polyfills = [];
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(process.cwd(), 'package.json');

    try {
      fs.writeFileSync(path.join(root, 'first.js'), 'globalThis.value = "first-entry";');
      fs.writeFileSync(path.join(root, 'second.js'), 'globalThis.value = "second-entry";');

      const first = await new Bundler({ ...config, entry: path.join(root, 'first.js') }).build({
        platform: 'ios',
        outfile: 'first.bundle',
        cache: false,
      });
      const second = await new Bundler({ ...config, entry: path.join(root, 'second.js') }).build({
        platform: 'ios',
        outfile: 'second.bundle',
        cache: false,
      });

      expect(first.code).toContain('first-entry');
      expect(second.code).toContain('second-entry');
      expect(second.code).not.toContain('first-entry');
      expect(fs.readFileSync(path.join(root, 'first.bundle'), 'utf-8')).toBe(first.code);
      expect(fs.readFileSync(path.join(root, 'second.bundle'), 'utf-8')).toBe(second.code);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
