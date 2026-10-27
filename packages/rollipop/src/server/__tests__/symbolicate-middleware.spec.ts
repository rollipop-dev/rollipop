import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import stripAnsi from 'strip-ansi';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundleStore } from '../bundle';
import { RollipopDevframeController } from '../devframe';
import type { AgentToolContext } from '../devframe/agent/tools';
import { getHotUpdatePath, HotUpdateStore } from '../hot-update-store';
import { symbolicate as symbolicateMiddleware } from '../middlewares/symbolicate';
import type { SymbolicateResult } from '../symbolicate';
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
  const context = {
    config: { mode },
    bundlerPool,
  } as unknown as DevServerContext;

  await app.register(symbolicateMiddleware, { context });
  await app.ready();

  return { app, bundlerPool, getBundle, resolveHotUpdate, context };
}

describe.each(['middleware', 'dashboard'] as const)('%s bundle symbolication', (target) => {
  it('uses next-token fallback only for dashboard bundle inspection', async () => {
    const { app, getBundle, context } = await createServer();
    const file = 'http://localhost:8081/index.bundle?platform=ios&dev=true';
    const map = new SourceMapGenerator({ file: 'index.bundle' });
    map.addMapping({
      generated: { line: 1, column: 2 },
      original: { line: 3, column: 0 },
      source: 'App.tsx',
    });
    map.setSourceContent('App.tsx', '\n\nthrow new Error("boom");');
    const consumer = await new SourceMapConsumer(map.toString());
    getBundle.mockResolvedValue({
      ...createBundleStore(),
      code: '  throw new Error("boom");',
      sourceMapConsumer: Promise.resolve(consumer),
    });

    try {
      if (target === 'middleware') {
        const response = await app.inject({
          method: 'POST',
          url: '/symbolicate',
          payload: { stack: [{ file, lineNumber: 1, column: 0 }] },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().stack[0]).toMatchObject({ file, lineNumber: 1, column: 0 });
      } else {
        const controller = new RollipopDevframeController(context, {} as AgentToolContext);
        const result = await controller.symbolicateBundlePosition(file, 0, 0);
        expect(result.stack[0]).toMatchObject({ file: 'App.tsx', lineNumber: 3, column: 0 });
      }
    } finally {
      await app.close();
      consumer.destroy();
    }
  });

  it.each([
    { minify: true, defaultMinify: false },
    { minify: false, defaultMinify: true },
    { minify: undefined, defaultMinify: true },
  ])(
    'uses the matching source map for $minify (default: $defaultMinify)',
    async ({ minify, defaultMinify }) => {
      const { app, bundlerPool, context } = await createServer();
      const consumers = await Promise.all(
        ['plain.ts', 'minified.ts'].map(async (source, index) => {
          const map = new SourceMapGenerator({ file: 'index.bundle' });
          const line = index === 0 ? 3 : 7;
          map.addMapping({
            generated: { line: 1, column: 0 },
            original: { line, column: 0 },
            source,
          });
          map.setSourceContent(source, '\n'.repeat(line - 1) + 'throw new Error("boom");');
          return new SourceMapConsumer(map.toString());
        }),
      );
      bundlerPool.get.mockImplementation((_name, options) => ({
        getBundle: vi.fn().mockResolvedValue({
          ...createBundleStore(),
          sourceMapConsumer: Promise.resolve(consumers[(options.minify ?? defaultMinify) ? 1 : 0]),
        }),
      }));
      const file =
        'http://localhost:8081/index.bundle?platform=ios&dev=false' +
        (minify == null ? '' : `&minify=${minify}`);

      try {
        let result: SymbolicateResult;
        if (target === 'middleware') {
          const response = await app.inject({
            method: 'POST',
            url: '/symbolicate',
            payload: { stack: [{ file, lineNumber: 1, column: 0 }] },
          });
          expect(response.statusCode).toBe(200);
          result = response.json();
        } else {
          const controller = new RollipopDevframeController(context, {} as AgentToolContext);
          result = await controller.symbolicateBundlePosition(file, 0, 0);
        }

        const expectedMinify = minify ?? defaultMinify;
        const expectedFile = expectedMinify ? 'minified.ts' : 'plain.ts';
        const expectedLine = expectedMinify ? 7 : 3;
        expect(result.stack[0]).toMatchObject({
          file: expectedFile,
          lineNumber: expectedLine,
          column: 0,
        });
        expect(result.codeFrame).toMatchObject({
          fileName: expectedFile,
          location: { row: expectedLine, column: 0 },
        });
      } finally {
        await app.close();
        consumers.forEach((consumer) => consumer.destroy());
      }
    },
  );
});

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
