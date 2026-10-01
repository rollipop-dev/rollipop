import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

import { Bundler } from '../../core/bundler';
import { EventBus } from '../../events/event-bus';
import { createTestConfig } from '../../testing/config';
import { BundlerPool } from '../bundler-pool';

vitest.mock('../../core/bundler', () => ({
  Bundler: {
    createId: vi.fn((_config: any, opts: any) => `${opts.platform}-${opts.dev}`),
    devEngine: vi.fn(),
  },
}));

vitest.mock('../../utils/config', () => ({
  bindReporter: vi.fn((config, onEvent) => ({
    ...config,
    reporter: {
      update: onEvent,
    },
  })),
}));

vitest.mock('../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

function resetPool() {
  // Clear static instances for test isolation
  (BundlerPool as any).instances.clear();
}

function createMockDevEngine(boundConfig: any, run = vi.fn().mockResolvedValue(undefined)) {
  const eventBus = new EventBus();
  eventBus.subscribe((event) => boundConfig.reporter.update(event));

  return {
    run,
    close: vi.fn().mockResolvedValue(undefined),
    getContext: () => ({ eventBus }),
    getBundleState: vi
      .fn()
      .mockResolvedValue({ lastFullBuildFailed: false, hasStaleOutput: false }),
  } as any;
}

describe('BundlerPool', () => {
  let projectRoot: string;
  let config: ReturnType<typeof createTestConfig>;
  const serverOptions = { host: 'localhost', port: 8081 };
  const createPool = () => new BundlerPool(config, serverOptions, new EventBus());

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-bundler-pool-'));
    config = createTestConfig(projectRoot);
    vi.mocked(Bundler).devEngine.mockImplementation(async (boundConfig) =>
      createMockDevEngine(boundConfig),
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('propagates initialization failures to bundle requests and rebuilds', async () => {
    resetPool();
    const error = new Error('Asset registry could not be resolved');
    vi.mocked(Bundler).devEngine.mockRejectedValueOnce(error);
    const eventBus = new EventBus();
    const onEvent = vi.fn();
    eventBus.subscribe(onEvent);
    const pool = new BundlerPool(config, serverOptions, eventBus);
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    // A rejected initialization must also be safe before a consumer subscribes.
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(instance.ensureInitialized).rejects.toThrow(error.message);
    await expect(instance.getBundle()).rejects.toThrow(error.message);
    await expect(instance.getSourceMap()).rejects.toThrow(error.message);
    await expect(instance.triggerFullBuild()).rejects.toThrow(error.message);
    expect(instance.status).toBe('build-failed');
    expect(onEvent).toHaveBeenCalledWith({
      type: 'bundle_build_failed',
      bundlerId: instance.id,
      error: expect.objectContaining({ message: error.message }),
    });
  });

  it.each([false, true])(
    'closes a failed engine and preserves the startup error (close fails: %s)',
    async (closeFails) => {
      resetPool();
      const error = new Error('Watcher startup failed');
      const engine = createMockDevEngine(config, vi.fn().mockRejectedValue(error));
      if (closeFails) {
        engine.close.mockRejectedValue(new Error('Cleanup failed'));
      }
      vi.mocked(Bundler).devEngine.mockResolvedValueOnce(engine);
      const instance = createPool().get('index.bundle', { platform: 'ios', dev: true });

      await expect(instance.getBundle()).rejects.toThrow(error.message);
      expect(engine.close).toHaveBeenCalledOnce();
      expect(instance.status).toBe('build-failed');
    },
  );

  it.each([false, true])(
    'preserves cleanup and the startup error when a failure listener throws (close fails: %s)',
    async (closeFails) => {
      resetPool();
      const error = new Error('Watcher startup failed');
      const engine = createMockDevEngine(config, vi.fn().mockRejectedValue(error));
      if (closeFails) {
        engine.close.mockRejectedValue(new Error('Cleanup failed'));
      }
      vi.mocked(Bundler).devEngine.mockResolvedValueOnce(engine);
      const eventBus = new EventBus();
      const onEvent = vi.fn(() => {
        throw new Error('Reporter failed');
      });
      eventBus.subscribe(onEvent);
      const pool = new BundlerPool(config, serverOptions, eventBus);
      const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

      await expect(instance.ensureInitialized).rejects.toThrow(error.message);
      await expect(instance.getBundle()).rejects.toThrow(error.message);
      expect(engine.close).toHaveBeenCalledOnce();
      expect(() => instance.devEngine).toThrow('DevEngine is not initialized');
      expect(instance.status).toBe('build-failed');
      expect(onEvent).toHaveBeenCalledOnce();
    },
  );

  it('should return a new instance for a new bundle', () => {
    resetPool();
    const pool = createPool();
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();
  });

  it('clears all stored HMR updates when the pool is created', () => {
    const hotPath = path.join(projectRoot, '.rollipop', 'hot');
    fs.mkdirSync(path.join(hotPath, 'ios-dev'), { recursive: true });
    fs.mkdirSync(path.join(hotPath, 'android-dev'), { recursive: true });
    fs.writeFileSync(path.join(hotPath, 'ios-dev', 'stale.js'), 'stale');
    fs.writeFileSync(path.join(hotPath, 'android-dev', 'stale.js'), 'stale');

    createPool();

    expect(fs.existsSync(hotPath)).toBe(false);
  });

  it('does not clear stored HMR updates when a dev engine is created', async () => {
    resetPool();
    const pool = createPool();
    const hotPath = path.join(projectRoot, '.rollipop', 'hot', 'ios-true');
    fs.mkdirSync(hotPath, { recursive: true });
    fs.writeFileSync(path.join(hotPath, 'current.js'), 'current');

    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });
    await instance.ensureInitialized;

    expect(fs.readFileSync(path.join(hotPath, 'current.js'), 'utf-8')).toBe('current');
  });

  it('should initialize once for identical bundle + build options', async () => {
    resetPool();
    const engine = createMockDevEngine(config);
    vi.mocked(Bundler).devEngine.mockResolvedValueOnce(engine);
    const pool = createPool();
    const instance1 = pool.get('index.bundle', { platform: 'ios', dev: true });
    const instance2 = pool.get('index.bundle', { platform: 'ios', dev: true });

    expect(instance1).toBe(instance2);
    await Promise.all([instance1.ensureInitialized, instance2.ensureInitialized]);
    expect(engine.run).toHaveBeenCalledOnce();
  });

  it('should return different instances for different platforms', () => {
    resetPool();
    const pool = createPool();
    const ios = pool.get('index.bundle', { platform: 'ios', dev: true });
    const android = pool.get('index.bundle', { platform: 'android', dev: true });

    expect(ios).not.toBe(android);
    expect(ios.buildOptions).toEqual({ platform: 'ios', dev: true, cache: true, minify: false });
    expect(android.buildOptions).toEqual({
      platform: 'android',
      dev: true,
      cache: true,
      minify: false,
    });
  });

  it('should return different instances for different dev modes', () => {
    resetPool();
    const pool = createPool();
    const dev = pool.get('index.bundle', { platform: 'ios', dev: true });
    const prod = pool.get('index.bundle', { platform: 'ios', dev: false });

    expect(dev).not.toBe(prod);
  });

  it('should strip leading slash and .bundle suffix from bundle names', () => {
    resetPool();
    const pool = createPool();
    const instance1 = pool.get('/index.bundle', { platform: 'ios', dev: true });
    const instance2 = pool.get('index', { platform: 'ios', dev: true });

    expect(instance1).toBe(instance2);
  });

  it('reports the initial build error when no source map is available', async () => {
    resetPool();
    const error = new Error('Could not resolve entry');
    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (boundConfig, _buildOptions, options) =>
        createMockDevEngine(
          boundConfig,
          vi.fn(async () => {
            await options.onOutput?.(error);
          }),
        ),
    );
    const instance = createPool().get('index.bundle', { platform: 'ios', dev: true });

    await expect(instance.getSourceMap()).rejects.toThrow(error.message);
  });

  it('keeps the source map of the last bundle until a bundle request rebuilds stale output', async () => {
    resetPool();
    const sourceMap = '{"version":3,"sources":["index.ts"],"mappings":"AAAA"}';
    const updatedSourceMap = '{"version":3,"sources":["index.ts"],"mappings":";AAAA"}';
    const engine = createMockDevEngine(config);
    engine.getBundleState.mockResolvedValue({ lastBuildErrored: false, hasStaleOutput: true });
    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (_boundConfig, _buildOptions, options) => {
        const emitOutput = (code: string, map: string) =>
          options.onOutput?.({
            output: [{ type: 'chunk', name: 'index', code, map: { toString: () => map } }],
          } as any);
        engine.run.mockImplementation(() => emitOutput('console.log("before");', sourceMap));
        engine.ensureLatestBuildOutput = vi.fn(() =>
          emitOutput('\nconsole.log("after");', updatedSourceMap),
        );
        return engine;
      },
    );
    const instance = createPool().get('index.bundle', { platform: 'ios', dev: true });

    await expect(instance.getSourceMap()).resolves.toBe(sourceMap);
    await expect(instance.getSourceMap()).resolves.toBe(sourceMap);
    expect(engine.run).toHaveBeenCalledOnce();
    expect(engine.ensureLatestBuildOutput).not.toHaveBeenCalled();

    const bundle = await instance.getBundle();
    expect(bundle.code).toBe('\nconsole.log("after");');
    expect(engine.ensureLatestBuildOutput).toHaveBeenCalledOnce();
    await expect(instance.getSourceMap()).resolves.toBe(updatedSourceMap);
  });

  it('emits bundle file path after writing build output', async () => {
    resetPool();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-bundler-pool-'));
    const eventBus = new EventBus();
    const events: unknown[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });

    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (boundConfig, _buildOptions, options) => {
        return createMockDevEngine(
          boundConfig,
          vi.fn(async () => {
            boundConfig.reporter.update({ type: 'bundle_build_started' });
            boundConfig.reporter.update({
              type: 'bundle_build_done',
              totalModules: 1,
              transformedModules: 1,
              cacheHitModules: 0,
              duration: 10,
            });
            expect(events).not.toContainEqual(
              expect.objectContaining({ type: 'bundle_build_done' }),
            );

            await options.onOutput?.({
              output: [
                {
                  type: 'chunk',
                  name: 'index',
                  code: 'console.log("ok");',
                  map: null,
                },
              ],
            } as any);
          }),
        );
      },
    );

    try {
      const pool = new BundlerPool(createTestConfig(projectRoot), serverOptions, eventBus);
      const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

      await instance.ensureInitialized;

      const doneEvent = events.find(
        (event) =>
          typeof event === 'object' && event != null && (event as any).type === 'bundle_build_done',
      ) as any;

      expect(doneEvent).toEqual(
        expect.objectContaining({
          type: 'bundle_build_done',
          bundlerId: 'ios-true',
          bundleFilePath: path.join(projectRoot, '.rollipop', 'bundles', 'ios-true.bundle'),
        }),
      );
      expect(fs.readFileSync(doneEvent.bundleFilePath, 'utf-8')).toBe('console.log("ok");');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('passes the dev-server source map URL to the dev engine', async () => {
    resetPool();
    const pool = createPool();
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    await instance.ensureInitialized;

    expect(vi.mocked(Bundler).devEngine).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        sourceMapUrl: 'http://localhost:8081/index.map?platform=ios&dev=true&minify=false',
      }),
    );
    expect(vi.mocked(Bundler).devEngine.mock.lastCall?.[2]).not.toHaveProperty('rebuildStrategy');
  });

  it('rewrites the last sourceMappingURL to the stored map URL before emitting HMR updates', async () => {
    resetPool();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-hmr-update-'));
    const eventBus = new EventBus();
    const events: unknown[] = [];
    const sourceMap = '{"version":3,"sources":["App.tsx"],"mappings":"AAAA"}';
    const patch = {
      type: 'Patch',
      code:
        '//# sourceMappingURL=previous.js.map\n' +
        'applyPatch();\n' +
        '//@ sourceMappingURL=/hmr_patch_0.js.map\n\n',
      filename: 'hmr_patch_0.js',
      sourcemap: sourceMap,
      sourcemapFilename: 'hmr_patch_0.js.map',
      changedIds: ['/App.tsx'],
      seq: 1,
    } as const;
    eventBus.subscribe((event) => {
      events.push(event);
    });

    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (boundConfig, _buildOptions, options) => {
        return createMockDevEngine(
          boundConfig,
          vi.fn(async () => {
            await options.onHmrUpdates?.({
              changedFiles: [path.join(projectRoot, 'App.tsx')],
              updates: [
                { clientId: '1', update: patch },
                { clientId: '1', update: { type: 'Noop' } },
              ],
            } as any);
          }),
        );
      },
    );

    try {
      const pool = new BundlerPool(createTestConfig(projectRoot), serverOptions, eventBus);
      const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

      await instance.ensureInitialized;

      expect(instance.status).toBe('idle');
      const rewrittenCode =
        '//# sourceMappingURL=previous.js.map\n' +
        'applyPatch();\n' +
        '//# sourceMappingURL=http://localhost:8081/hot/ios-true/hmr_patch_0.js.map';
      expect(events).toEqual([
        expect.objectContaining({
          type: 'hmr_updates',
          bundlerId: 'ios-true',
          changedFiles: [path.join(projectRoot, 'App.tsx')],
          updates: [
            { clientId: '1', update: { ...patch, code: rewrittenCode } },
            { clientId: '1', update: { type: 'Noop' } },
          ],
        }),
      ]);
      const hotPath = path.join(projectRoot, '.rollipop', 'hot', 'ios-true');
      expect(fs.readFileSync(path.join(hotPath, patch.filename), 'utf8')).toBe(rewrittenCode);
      expect(fs.readFileSync(path.join(hotPath, patch.sourcemapFilename), 'utf8')).toBe(sourceMap);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('emits hmr_failed without build lifecycle events for failed HMR updates', async () => {
    resetPool();
    const eventBus = new EventBus();
    const events: unknown[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });
    const hmrError = new Error('Unexpected token');

    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (boundConfig, _buildOptions, options) => {
        return createMockDevEngine(
          boundConfig,
          vi.fn(async () => {
            await options.onHmrUpdates?.(hmrError);
          }),
        );
      },
    );

    const pool = new BundlerPool(config, serverOptions, eventBus);
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    await instance.ensureInitialized;

    expect(instance.status).toBe('idle');
    expect(events).toEqual([
      expect.objectContaining({
        type: 'hmr_failed',
        bundlerId: 'ios-true',
        error: expect.objectContaining({ message: 'Unexpected token' }),
      }),
    ]);
  });
});
