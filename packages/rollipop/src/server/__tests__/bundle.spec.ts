import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { FileSystemBundleStore } from '../bundle';

describe('FileSystemBundleStore', () => {
  it.each(['code', 'sourceMap'] as const)(
    'keeps externally modified source maps invalid after reading %s first',
    async (firstRead) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-bundle-map-'));
      const sourceMap = JSON.stringify({
        version: 3,
        sources: ['index.ts'],
        names: [],
        mappings: 'AAAA',
      });
      const store = new FileSystemBundleStore(root, 'test', 'original();', sourceMap);
      const consumer = await store.sourceMapConsumer;

      try {
        expect(store.sourceMap).toBe(sourceMap);
        expect(consumer).toBeDefined();

        fs.writeFileSync(store.bundleFilePath, '\nmodified();');
        const changedTime = new Date(fs.statSync(store.bundleFilePath).mtimeMs + 2000);
        fs.utimesSync(store.bundleFilePath, changedTime, changedTime);

        expect(store[firstRead]).toBe(firstRead === 'code' ? '\nmodified();' : undefined);
        expect(store.sourceMapConsumer).toBeUndefined();
        expect(store.code).toBe('\nmodified();');
        expect(store.isStale()).toBe(false);
        expect(store.sourceMap).toBeUndefined();
        expect(store.sourceMapConsumer).toBeUndefined();
      } finally {
        consumer?.destroy();
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
