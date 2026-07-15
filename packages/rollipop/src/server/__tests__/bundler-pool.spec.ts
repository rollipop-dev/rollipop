import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

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
    getContext: () => ({ eventBus }),
    getBundleState: vi
      .fn()
      .mockResolvedValue({ lastFullBuildFailed: false, hasStaleOutput: false }),
  } as any;
}

describe('BundlerPool', () => {
  const config = createTestConfig('/root/project');
  const serverOptions = { host: 'localhost', port: 8081 };
  const createPool = () => new BundlerPool(config, serverOptions, new EventBus());

  beforeEach(() => {
    vi.mocked(Bundler).devEngine.mockImplementation(async (boundConfig) =>
      createMockDevEngine(boundConfig),
    );
  });

  it('should return a new instance for a new bundle', () => {
    resetPool();
    const pool = createPool();
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();
  });

  it('should return the same instance for identical bundle + build options', () => {
    resetPool();
    const pool = createPool();
    const instance1 = pool.get('index.bundle', { platform: 'ios', dev: true });
    const instance2 = pool.get('index.bundle', { platform: 'ios', dev: true });

    expect(instance1).toBe(instance2);
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
  });

  it('stores generated patches without rewriting them before emitting HMR updates', async () => {
    resetPool();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-hmr-update-'));
    const eventBus = new EventBus();
    const events: unknown[] = [];
    const sourceMap = '{"version":3,"sources":["App.tsx"],"mappings":"AAAA"}';
    const patch = {
      type: 'Patch',
      code: 'applyPatch();\n//# sourceMappingURL=hmr_patch_0.js.map',
      filename: 'hmr_patch_0.js',
      sourcemap: sourceMap,
      sourcemapFilename: 'hmr_patch_0.js.map',
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
      expect(events).toEqual([
        expect.objectContaining({
          type: 'hmr_updates',
          bundlerId: 'ios-true',
          changedFiles: [path.join(projectRoot, 'App.tsx')],
          updates: [
            { clientId: '1', update: patch },
            { clientId: '1', update: { type: 'Noop' } },
          ],
        }),
      ]);
      const hotPath = path.join(projectRoot, '.rollipop', 'hot', 'ios-true');
      expect(fs.readFileSync(path.join(hotPath, patch.filename), 'utf8')).toBe(patch.code);
      expect(fs.readFileSync(path.join(hotPath, patch.sourcemapFilename), 'utf8')).toBe(sourceMap);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('stores patches returned by explicit invalidation without rewriting them', async () => {
    resetPool();
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-hmr-invalidate-'));
    const sourceMap = '{"version":3,"sources":["App.tsx"],"mappings":"AAAA"}';
    const patch = {
      type: 'Patch',
      code: 'applyInvalidation();\n//# sourceMappingURL=hmr_patch_1.js.map',
      filename: 'hmr_patch_1.js',
      sourcemap: sourceMap,
      sourcemapFilename: 'hmr_patch_1.js.map',
    } as const;
    const invalidate = vi.fn().mockResolvedValue([{ clientId: '1', update: patch }]);
    vi.mocked(Bundler).devEngine.mockImplementationOnce(async (boundConfig) => ({
      ...createMockDevEngine(boundConfig),
      invalidate,
    }));

    try {
      const pool = new BundlerPool(createTestConfig(projectRoot), serverOptions, new EventBus());
      const instance = pool.get('index.bundle', { platform: 'ios', dev: true });
      const updates = await instance.invalidate(path.join(projectRoot, 'App.tsx'));

      expect(invalidate).toHaveBeenCalledWith(path.join(projectRoot, 'App.tsx'));
      expect(updates).toEqual([{ clientId: '1', update: patch }]);
      const hotPath = path.join(projectRoot, '.rollipop', 'hot', 'ios-true');
      expect(fs.readFileSync(path.join(hotPath, patch.filename), 'utf8')).toBe(patch.code);
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
