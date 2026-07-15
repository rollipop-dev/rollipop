import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import { SourceMapGenerator } from 'source-map';
import stripAnsi from 'strip-ansi';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundleStore } from '../bundle';
import { getHotUpdatePath, HotUpdateStore } from '../hot-update-store';
import { symbolicate as symbolicateMiddleware } from '../middlewares/symbolicate';
import type { DevServerContext } from '../types';

function createBundleStore(): BundleStore {
  return {
    bundleFilePath: '/tmp/index.bundle',
    code: 'var value = 1;',
    sourceMap: undefined,
    sourceMapConsumer: undefined,
  };
}

async function createServer(mode = 'development', hotUpdateStore?: HotUpdateStore) {
  const getBundle = vi.fn().mockResolvedValue(createBundleStore());
  const resolveHotUpdate = vi.fn().mockReturnValue(createBundleStore());
  const bundlerPool = {
    get: vi.fn().mockReturnValue({ getBundle }),
    hotUpdateStore: hotUpdateStore ?? { resolve: resolveHotUpdate },
  };
  const app = Fastify();

  await app.register(symbolicateMiddleware, {
    context: {
      config: { mode },
      bundlerPool,
    } as unknown as DevServerContext,
  });
  await app.ready();

  return { app, bundlerPool, getBundle, resolveHotUpdate };
}

describe('symbolicate middleware', () => {
  it('returns the original stack when no frame has a platform query', async () => {
    const { app, bundlerPool } = await createServer();
    const stack = [{ file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 2 }];

    const response = await app.inject({
      method: 'POST',
      url: '/symbolicate',
      payload: { stack },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ stack, codeFrame: null });
    expect(bundlerPool.get).not.toHaveBeenCalled();

    await app.close();
  });

  it('defaults a missing dev query from the resolved config mode', async () => {
    const { app, bundlerPool } = await createServer('development');

    const response = await app.inject({
      method: 'POST',
      url: '/symbolicate',
      payload: {
        stack: [
          {
            file: 'http://localhost:8081/index.bundle?platform=ios',
            lineNumber: 1,
            column: 2,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(bundlerPool.get).toHaveBeenCalledWith('index', { platform: 'ios', dev: true });

    await app.close();
  });

  it('resolves stored HMR patches without requiring a platform query', async () => {
    const { app, bundlerPool, getBundle, resolveHotUpdate } = await createServer();
    const stack = [
      {
        file: 'http://localhost:8081/hot/remote-id/hmr_patch_0.js',
        lineNumber: 2,
        column: 4,
      },
    ];

    const response = await app.inject({
      method: 'POST',
      url: '/symbolicate',
      payload: { stack },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      stack: [{ ...stack[0], collapse: false }],
      codeFrame: expect.objectContaining({ fileName: '/hot/remote-id/hmr_patch_0.js' }),
    });
    expect(resolveHotUpdate).toHaveBeenCalledWith('remote-id', 'hmr_patch_0.js');
    expect(bundlerPool.get).not.toHaveBeenCalled();
    expect(getBundle).not.toHaveBeenCalled();

    await app.close();
  });

  it('symbolicates an HMR frame from the stored patch sourcemap', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-symbolicate-hot-'));
    const hotUpdateStore = new HotUpdateStore(projectRoot);
    const id = 'remote-id';
    const filename = 'hmr_patch_0.js';
    const source = ['const value = 1;', `throw new Error('boom');`].join('\n');
    const map = new SourceMapGenerator({ file: filename });
    map.addMapping({
      generated: { line: 2, column: 0 },
      original: { line: 2, column: 0 },
      source: 'App.tsx',
    });
    map.setSourceContent('App.tsx', source);
    hotUpdateStore.write(id, {
      code: `(function () {\nthrow new Error('boom');\n})();`,
      filename,
      sourcemap: map.toString(),
      sourcemapFilename: `${filename}.map`,
    });
    const { app } = await createServer('development', new HotUpdateStore(projectRoot));

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/symbolicate',
        payload: {
          stack: [
            {
              file: `http://localhost:8081${getHotUpdatePath(id, filename)}`,
              lineNumber: 2,
              column: 0,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.stack[0]).toEqual(
        expect.objectContaining({ file: 'App.tsx', lineNumber: 2, column: 0 }),
      );
      expect(result.codeFrame).toEqual(
        expect.objectContaining({ fileName: 'App.tsx', location: { row: 2, column: 0 } }),
      );
      expect(stripAnsi(result.codeFrame.content)).toContain(`throw new Error('boom');`);
    } finally {
      await app.close();
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('prepares every bundle URL represented in the stack', async () => {
    const { app, bundlerPool } = await createServer('development');

    const response = await app.inject({
      method: 'POST',
      url: '/symbolicate',
      payload: {
        stack: [
          {
            file: 'http://localhost:8081/index.bundle?platform=ios&dev=true',
            lineNumber: 1,
            column: 2,
          },
          {
            file: 'http://localhost:8081/secondary.bundle?platform=android&dev=false',
            lineNumber: 2,
            column: 4,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(bundlerPool.get).toHaveBeenCalledWith('index', { platform: 'ios', dev: true });
    expect(bundlerPool.get).toHaveBeenCalledWith('secondary', {
      platform: 'android',
      dev: false,
    });

    await app.close();
  });
});
