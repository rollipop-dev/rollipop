import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { Bundler } from '../bundler';

describe('Bundler', () => {
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
