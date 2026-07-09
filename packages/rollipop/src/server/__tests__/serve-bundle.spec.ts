import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundleStore } from '../bundle';
import { ServerEventBus } from '../events/event-bus';
import { serveBundle } from '../middlewares/serve-bundle';
import type { DevServerContext } from '../types';

function createBundleStore(code: string, sourceMap = '{"version":3,"sources":[],"mappings":""}') {
  return {
    bundleFilePath: '/tmp/index.bundle',
    code,
    sourceMap,
    sourceMapConsumer: undefined,
  } satisfies BundleStore;
}

async function createServer(bundleStore: BundleStore) {
  const getBundle = vi.fn().mockResolvedValue(bundleStore);
  const bundlerPool = {
    get: vi.fn().mockReturnValue({ id: 'ios-true', getBundle }),
  };
  const app = Fastify();

  await app.register(serveBundle, {
    context: {
      serverBaseUrl: 'http://localhost:8081',
      bundlerPool,
      eventBus: new ServerEventBus(),
    } as unknown as DevServerContext,
  });
  await app.ready();

  return { app, bundlerPool, getBundle };
}

describe('serve bundle middleware', () => {
  it('serves stored bundle code without rewriting sourceMappingURL', async () => {
    const code = 'console.log("ok");\n//# sourceMappingURL=stored.map';
    const { app } = await createServer(createBundleStore(code));

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/index.bundle?platform=ios&dev=true',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/javascript');
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(response.body)));
      expect(response.body).toBe(code);
    } finally {
      await app.close();
    }
  });

  it('serves source maps from the Metro-compatible map route', async () => {
    const sourceMap = '{"version":3,"sources":["index.ts"],"mappings":""}';
    const { app } = await createServer(createBundleStore('console.log("ok");', sourceMap));

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/index.map?platform=ios&dev=true',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(sourceMap)));
      expect(response.body).toBe(sourceMap);
    } finally {
      await app.close();
    }
  });
});
