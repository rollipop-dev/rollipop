// oxlint-disable typescript-eslint(unbound-method)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { staticPath as dashboardStaticPath } from '@rollipop/dashboard';
import { describe, expect, it, vi, vitest } from 'vite-plus/test';

import { SHARED_DATA_PATH } from '../../common/constants';
import { createTestConfig } from '../../testing/config';
import type { BundlerDevEngine } from '../bundler-pool';
import { createDevServer } from '../create-dev-server';

vitest.mock('@react-native-community/cli-server-api', () => ({
  createDevServerMiddleware: vi.fn().mockReturnValue({
    middleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    websocketEndpoints: {},
    messageSocketEndpoint: {
      server: {},
      broadcast: vi.fn(),
    },
    eventsSocketEndpoint: {
      server: {},
      reportEvent: vi.fn(),
    },
  }),
}));

vitest.mock('@react-native/dev-middleware', () => ({
  createDevMiddleware: vi.fn().mockReturnValue({
    middleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    websocketEndpoints: {},
  }),
}));

describe('createDevServer', () => {
  it('should create a dev server', async () => {
    const config = createTestConfig('/root/project');
    const devServer = await createDevServer(config, { port: 0 });

    expect(devServer.instance).toBeDefined();
    expect(devServer.instance.use).toBeDefined();
    expect(devServer.middlewares.use).toBeDefined();
    await devServer.instance.close();
  });

  it('should serve dashboard static files without redirecting root to dashboard', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    const indexHtml = await fs.readFile(path.join(dashboardStaticPath, 'index.html'), 'utf8');
    const rootResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/',
    });

    expect(rootResponse.statusCode).not.toBe(302);
    expect(rootResponse.headers.location).toBeUndefined();

    const indexResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.headers['content-type']).toContain('text/html');
    expect(indexResponse.body).toBe(indexHtml);

    await devServer.instance.close();
  });

  it('should serve the dashboard 404 page for missing HTML GET requests', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    const notFoundHtml = await fs.readFile(path.join(dashboardStaticPath, '404.html'), 'utf8');
    const response = await devServer.instance.inject({
      method: 'GET',
      url: '/dashboard/missing-dashboard-page',
      headers: {
        accept: 'text/html',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toBe(notFoundHtml);

    await devServer.instance.close();
  });

  it('should serve analyzer report files through the dashboard route', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rollipop-analyze-report-'));
    const devServer = await createDevServer(createTestConfig(projectRoot), { port: 0 });
    const reportPath = path.join(projectRoot, SHARED_DATA_PATH, 'analyze', 'ios-dev.html');
    const reportHtml = '<!doctype html><html><body>Analyzer report</body></html>';

    try {
      await devServer.instance.ready();
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, reportHtml);

      const response = await devServer.instance.inject({
        method: 'GET',
        url: '/dashboard/analyze-report/ios-dev.html',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toBe(reportHtml);

      const missingResponse = await devServer.instance.inject({
        method: 'HEAD',
        url: '/dashboard/analyze-report/missing.html',
      });

      expect(missingResponse.statusCode).toBe(404);
    } finally {
      await devServer.instance.close();
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('should keep SSE event streams open', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();

    try {
      const response = await fetch(new URL('/sse/events', address), {
        headers: {
          accept: 'text/event-stream',
        },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1000)]),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.body).not.toBeNull();

      const reader = response.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      expect(new TextDecoder().decode(firstChunk.value)).toBe(':ok\n\n');

      const pendingRead = reader.read().then(
        () => 'closed' as const,
        () => 'closed' as const,
      );
      await expect(
        Promise.race([pendingRead, delay(100).then(() => 'open' as const)]),
      ).resolves.toBe('open');

      controller.abort();
      await reader.cancel().catch(() => undefined);
      await Promise.race([pendingRead, delay(100)]);
    } finally {
      controller.abort();
      await devServer.instance.close();
    }
  });

  it('should report disabled MCP routes until enabled', async () => {
    const defaultServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await defaultServer.instance.ready();
    const defaultRoutes = defaultServer.instance.printRoutes();
    expect(defaultRoutes).not.toContain('reset-cache');

    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const response = await defaultServer.instance.inject({
        method,
        url: '/mcp',
        ...(method === 'POST' ? { payload: { jsonrpc: '2.0', method: 'initialize' } } : {}),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: {
          code: 'MCP_DISABLED',
          message: 'MCP server is disabled. Start Rollipop with --mcp to enable it.',
        },
      });
    }

    await defaultServer.instance.close();

    const mcpServer = await createDevServer(createTestConfig('/root/project'), {
      port: 0,
      mcp: true,
    });
    await mcpServer.instance.ready();
    const mcpRoutes = mcpServer.instance.printRoutes();
    expect(mcpRoutes).not.toContain('reset-cache');
    await mcpServer.instance.close();
  }, 10_000);

  it('should expose REST API snapshot data', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    const response = await devServer.instance.inject({
      method: 'GET',
      url: '/api/snapshot',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({
          bundlerVersion: expect.any(String),
          rootPath: '/root/project',
          server: expect.objectContaining({
            status: 'listening',
            serverBaseUrl: expect.any(String),
          }),
        }),
        bundlers: [],
        devices: [],
        buildSummary: {
          count: 0,
          latest: null,
        },
      }),
    );

    await devServer.instance.close();
  });

  it('should expose feature flags from the resolved config through REST API', async () => {
    const config = createTestConfig('/root/project');
    const disabledServer = await createDevServer(config, { port: 0 });
    await disabledServer.instance.ready();

    const disabledResponse = await disabledServer.instance.inject({
      method: 'GET',
      url: '/api/feature-flags',
    });

    expect(disabledResponse.statusCode).toBe(200);
    expect(disabledResponse.json()).toEqual({ analyze: false });

    await disabledServer.instance.close();

    const enabledServer = await createDevServer(
      {
        ...config,
        analyzer: {
          ...config.analyzer,
          enabled: true,
        },
      },
      { port: 0 },
    );
    await enabledServer.instance.ready();

    const enabledResponse = await enabledServer.instance.inject({
      method: 'GET',
      url: '/api/feature-flags',
    });

    expect(enabledResponse.statusCode).toBe(200);
    expect(enabledResponse.json()).toEqual({ analyze: true });

    await enabledServer.instance.close();
  });

  it('should trigger a bundler full build through REST API', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();
    const triggerFullBuild = vi.fn().mockResolvedValue(undefined);
    const getInstanceById = vi.spyOn(devServer.bundlerPool, 'getInstanceById').mockReturnValue({
      id: 'ios-dev',
      triggerFullBuild,
    } as unknown as BundlerDevEngine);

    const response = await devServer.instance.inject({
      method: 'POST',
      url: '/api/bundlers/ios-dev/trigger-full-build',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      triggered: true,
      bundlerId: 'ios-dev',
    });
    expect(getInstanceById).toHaveBeenCalledWith('ios-dev');
    expect(triggerFullBuild).toHaveBeenCalledOnce();

    await devServer.instance.close();
  });

  it('should expose collected builds and logs through REST API', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    devServer.eventBus.emit({ type: 'bundle_build_started', bundlerId: 'ios-dev' });
    devServer.eventBus.emit({
      type: 'build_error',
      bundlerId: 'ios-dev',
      level: 'warn',
      log: {
        plugin: 'test-plugin',
        message: 'build warning',
      },
    });
    devServer.eventBus.emit({
      type: 'bundle_build_done',
      bundlerId: 'ios-dev',
      totalModules: 1,
      transformedModules: 1,
      cacheHitModules: 0,
      duration: 25,
    });
    devServer.eventBus.emit({ type: 'bundle_build_started', bundlerId: 'ios-dev' });
    devServer.eventBus.emit({
      type: 'bundle_build_done',
      bundlerId: 'ios-dev',
      totalModules: 1,
      transformedModules: 1,
      cacheHitModules: 0,
      duration: 40,
    });

    const response = await devServer.instance.inject({
      method: 'GET',
      url: '/api/builds',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'ios-dev',
        bundlerId: 'ios-dev',
        status: 'success',
        durationMs: 40,
        messages: {
          info: 4,
          warn: 1,
          error: 0,
        },
      }),
    ]);

    const bundlerId = response.json()[0].bundlerId;
    const logsResponse = await devServer.instance.inject({
      method: 'GET',
      url: `/api/builds/${bundlerId}/logs`,
    });

    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json()).toHaveLength(5);
    expect(logsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          source: 'rollipop',
          message: 'Build started.',
        }),
        expect.objectContaining({
          level: 'warn',
          source: 'test-plugin',
          message: 'build warning',
        }),
        expect.objectContaining({
          level: 'info',
          source: 'rollipop',
          message: 'Build completed in 25.00ms.',
        }),
        expect.objectContaining({
          level: 'info',
          source: 'rollipop',
          message: 'Build completed in 40.00ms.',
        }),
      ]),
    );

    const deleteLogsResponse = await devServer.instance.inject({
      method: 'DELETE',
      url: `/api/builds/${bundlerId}/logs`,
    });

    expect(deleteLogsResponse.statusCode).toBe(200);
    expect(deleteLogsResponse.json()).toEqual({
      deleted: true,
      bundlerId,
    });

    const emptyLogsResponse = await devServer.instance.inject({
      method: 'GET',
      url: `/api/builds/${bundlerId}/logs`,
    });

    expect(emptyLogsResponse.statusCode).toBe(200);
    expect(emptyLogsResponse.json()).toEqual([]);

    const clearedBuildsResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/api/builds',
    });

    expect(clearedBuildsResponse.json()).toEqual([
      expect.objectContaining({
        id: 'ios-dev',
        messages: {
          info: 0,
          warn: 0,
          error: 0,
        },
      }),
    ]);

    await devServer.instance.close();
  });

  it('should expose empty logs for a known bundler without collected build state', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();
    vi.spyOn(devServer.bundlerPool, 'getInstanceById').mockReturnValue({
      id: 'ios-dev',
      entry: 'index',
      status: 'idle',
      buildOptions: {
        platform: 'ios',
        dev: true,
        cache: true,
        minify: false,
      },
    } as unknown as BundlerDevEngine);

    const logsResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/api/builds/ios-dev/logs',
    });

    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json()).toEqual([]);

    const deleteLogsResponse = await devServer.instance.inject({
      method: 'DELETE',
      url: '/api/builds/ios-dev/logs',
    });

    expect(deleteLogsResponse.statusCode).toBe(200);
    expect(deleteLogsResponse.json()).toEqual({
      deleted: true,
      bundlerId: 'ios-dev',
    });

    await devServer.instance.close();
  });

  it('should expose devices from the devtools target list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 'target-1',
            title: 'G.H. iPhone',
            type: 'node',
            devtoolsFrontendUrl: '/debugger-ui?target=target-1',
            webSocketDebuggerUrl: 'ws://localhost:8081/debugger-proxy?target=target-1',
          },
        ]),
        { status: 200 },
      );
    });
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    const listResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/api/devices',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        id: 'target-1',
        name: 'G.H. iPhone',
        debuggerUrl: 'http://localhost/debugger-ui?target=target-1',
      },
    ]);

    const detailResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/api/devices/target-1',
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: 'target-1',
        name: 'G.H. iPhone',
        debugTarget: expect.objectContaining({
          webSocketDebuggerUrl: 'ws://localhost:8081/debugger-proxy?target=target-1',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      method: 'POST',
      signal: expect.any(AbortSignal),
    });

    fetchMock.mockRestore();
    await devServer.instance.close();
  });

  it('should invoke `configureServer` hooks from plugins', async () => {
    const config = createTestConfig('/root/project');
    const invokedOrder: string[] = [];

    const pre = vi.fn();
    const post = vi.fn();

    config.plugins = [
      {
        name: 'plugin-post',
        configureServer(server) {
          return () => {
            post(Boolean(server.instance));
            invokedOrder.push('post');
          };
        },
      },
      {
        name: 'plugin-post-async',
        configureServer(server) {
          return async () => {
            post(Boolean(server.instance));
            invokedOrder.push('post-async');
          };
        },
      },
      {
        name: 'plugin-pre',
        configureServer(server) {
          pre(Boolean(server.instance));
          invokedOrder.push('pre');
        },
      },
      {
        name: 'plugin-pre-async',
        async configureServer(server) {
          pre(Boolean(server.instance));
          invokedOrder.push('pre-async');
        },
      },
    ];

    const devServer = await createDevServer(config, { port: 0 });

    expect(pre).toHaveBeenCalledWith(true);
    expect(post).toHaveBeenCalledWith(true);
    expect(invokedOrder).toEqual(['pre', 'pre-async', 'post', 'post-async']);
    await devServer.instance.close();
  });
});
