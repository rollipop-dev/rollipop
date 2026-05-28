import { describe, expect, it, vi, vitest } from 'vite-plus/test';

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
  bindReporter: vi.fn((config) => config),
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
});
