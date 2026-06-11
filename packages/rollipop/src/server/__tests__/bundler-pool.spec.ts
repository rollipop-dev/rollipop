import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi, vitest } from 'vite-plus/test';

import { Bundler } from '../../core/bundler';
import { createTestConfig } from '../../testing/config';
import { BundlerPool } from '../bundler-pool';
import { ServerEventBus } from '../events/event-bus';

vitest.mock('../../core/bundler', () => ({
  Bundler: {
    createId: vi.fn((_config: any, opts: any) => `${opts.platform}-${opts.dev}`),
    devEngine: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue(undefined),
      getBundleState: vi
        .fn()
        .mockResolvedValue({ lastFullBuildFailed: false, hasStaleOutput: false }),
    }),
  },
}));

vitest.mock('../../common/env', () => ({
  isDebugEnabled: vi.fn().mockReturnValue(false),
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

describe('BundlerPool', () => {
  const config = createTestConfig('/root/project');
  const serverOptions = { host: 'localhost', port: 8081 };
  const createPool = () => new BundlerPool(config, serverOptions, new ServerEventBus());

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
    const eventBus = new ServerEventBus();
    const events: unknown[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });

    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (boundConfig, _buildOptions, options) => {
        return {
          run: vi.fn(async () => {
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
          getBundleState: vi
            .fn()
            .mockResolvedValue({ lastFullBuildFailed: false, hasStaleOutput: false }),
        } as any;
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

  it('emits build lifecycle events around successful HMR updates', async () => {
    resetPool();
    const eventBus = new ServerEventBus();
    const events: unknown[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });

    vi.mocked(Bundler).devEngine.mockImplementationOnce(
      async (_boundConfig, _buildOptions, options) => {
        return {
          run: vi.fn(async () => {
            await options.onHmrUpdates?.({
              changedFiles: ['/root/project/App.tsx'],
              updates: [],
            } as any);
          }),
          getBundleState: vi
            .fn()
            .mockResolvedValue({ lastFullBuildFailed: false, hasStaleOutput: false }),
        } as any;
      },
    );

    const pool = new BundlerPool(config, serverOptions, eventBus);
    const instance = pool.get('index.bundle', { platform: 'ios', dev: true });

    await instance.ensureInitialized;

    expect(instance.status).toBe('build-done');
    expect(events).toEqual([
      expect.objectContaining({ type: 'bundle_build_started', bundlerId: 'ios-true' }),
      expect.objectContaining({ type: 'hmr_updates', bundlerId: 'ios-true' }),
      expect.objectContaining({
        type: 'bundle_build_done',
        bundlerId: 'ios-true',
        totalModules: 1,
        transformedModules: 1,
      }),
    ]);
  });
});
