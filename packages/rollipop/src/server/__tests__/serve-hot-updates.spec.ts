import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { getHotUpdatePath, HotUpdateStore } from '../hot-update-store';
import { serveHotUpdates } from '../middlewares/serve-hot-updates';

describe('serve hot updates middleware', () => {
  let projectRoot: string;
  let hotUpdateStore: HotUpdateStore;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-serve-hot-update-'));
    hotUpdateStore = new HotUpdateStore(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  async function createServer() {
    const app = Fastify();
    await app.register(serveHotUpdates, { hotUpdateStore });
    await app.ready();
    return app;
  }

  it('serves stored patch code and sourcemaps without caching', async () => {
    const id = 'remote-id';
    const filename = 'hmr_patch_0.js';
    const sourcemapFilename = `${filename}.map`;
    const code = `throw new Error('boom');\n//# sourceMappingURL=${sourcemapFilename}`;
    const sourcemap = '{"version":3,"sources":["App.tsx"],"mappings":"AAAA"}';
    hotUpdateStore.write(id, { code, filename, sourcemap, sourcemapFilename });
    const app = await createServer();

    try {
      const codeResponse = await app.inject({
        method: 'GET',
        url: getHotUpdatePath(id, filename),
      });
      expect(codeResponse.statusCode).toBe(200);
      expect(codeResponse.body).toBe(code);
      expect(codeResponse.headers['content-type']).toContain('application/javascript');
      expect(codeResponse.headers['content-length']).toBe(String(Buffer.byteLength(code)));
      expect(codeResponse.headers['cache-control']).toBe('no-store');
      expect(codeResponse.headers['access-control-allow-origin']).toBe('devtools://devtools');

      const mapResponse = await app.inject({
        method: 'GET',
        url: getHotUpdatePath(id, sourcemapFilename),
      });
      expect(mapResponse.statusCode).toBe(200);
      expect(mapResponse.body).toBe(sourcemap);
      expect(mapResponse.headers['content-type']).toContain('application/json');
      expect(mapResponse.headers['content-length']).toBe(String(Buffer.byteLength(sourcemap)));
      expect(mapResponse.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for missing hot update assets', async () => {
    const app = await createServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: getHotUpdatePath('remote-id', 'missing.js'),
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
