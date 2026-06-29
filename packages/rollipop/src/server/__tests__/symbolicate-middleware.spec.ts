import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundleStore } from '../bundle';
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

async function createServer(mode = 'development') {
  const getBundle = vi.fn().mockResolvedValue(createBundleStore());
  const bundlerPool = {
    get: vi.fn().mockReturnValue({ getBundle }),
  };
  const app = Fastify();

  await app.register(symbolicateMiddleware, {
    context: {
      config: { mode },
      bundlerPool,
    } as unknown as DevServerContext,
  });
  await app.ready();

  return { app, bundlerPool, getBundle };
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
