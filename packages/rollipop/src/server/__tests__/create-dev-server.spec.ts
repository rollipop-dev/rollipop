// oxlint-disable typescript-eslint(unbound-method)
import { describe, expect, it, vi, vitest } from 'vite-plus/test';

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

  it('should report disabled MCP routes until enabled', async () => {
    const defaultServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await defaultServer.instance.ready();
    const defaultRoutes = defaultServer.instance.printRoutes();
    expect(defaultRoutes).toContain('mcp (');
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
    expect(mcpRoutes).toContain('mcp (');
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
      optionsSnapshot: {
        platform: 'ios',
        dev: true,
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
