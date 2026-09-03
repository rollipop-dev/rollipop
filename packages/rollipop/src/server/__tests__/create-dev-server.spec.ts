// oxlint-disable typescript-eslint(unbound-method)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { staticPath as dashboardStaticPath } from '@rollipop/dashboard';
import { connectDevframe, type DevframeConnection, type DevframeRpcClient } from 'devframe/client';
import { describe, expect, it, vi, vitest } from 'vite-plus/test';

import type { RollipopDevToolsNodeContext } from '../../core/plugins/types';
import { FileStorage } from '../../storage/file-storage';
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

    const routeResponse = await devServer.instance.inject({
      method: 'GET',
      url: '/dashboard/instances?bundlerId=ios-dev',
      headers: {
        accept: 'text/html',
      },
    });

    expect(routeResponse.statusCode).toBe(200);
    expect(routeResponse.headers['content-type']).toContain('text/html');
    expect(routeResponse.body).toBe(indexHtml);

    await devServer.instance.close();
  });

  it('should serve the embedded Hub UI', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(new URL('/__rollipop/embedded.js', address));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/javascript');
      expect((await response.text()).length).toBeGreaterThan(0);
    } finally {
      await devServer.instance.close();
    }
  });

  it('should expose Devframe endpoints only under the Rollipop namespace', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });

    try {
      await devServer.instance.ready();

      for (const endpoint of [
        '/__connection.json',
        '/__index.json',
        '/__client-imports.js',
        '/__sse',
        '/__mcp',
        '/embedded.js',
      ]) {
        const response = await devServer.instance.inject({
          method: 'GET',
          url: endpoint,
        });

        expect(response.statusCode).toBe(404);
      }
    } finally {
      await devServer.instance.close();
    }
  });

  it('should expose dashboard state through Devframe RPC', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(new URL('/__rollipop/__connection.json', address));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        backend: 'sse',
        sse: { path: '/__rollipop/__sse' },
        mcp: { path: '__mcp' },
        configs: {
          ui: {
            branding: {
              productName: 'Rollipop',
              primaryColor: 'hsl(207, 90%, 61%)',
              logo: '/dashboard/logo.svg',
              favicon: '/dashboard/favicon.ico',
            },
            dockPreferences: {
              defaultMode: 'edge',
              defaultPosition: 'bottom',
            },
          },
        },
      });

      client = await connectDashboardRpc(address);
      const snapshot = (await client.scope('rollipop').rpc.call('get-snapshot')) as {
        project: {
          bundlerVersion: string;
          rootPath: string;
          server: { status: string; serverBaseUrl: string };
        };
        bundlers: unknown[];
        devices: unknown[];
        buildSummary: { count: number; latest: unknown };
      };

      expect(snapshot).toEqual(
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
    } finally {
      client?.close?.();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

  it('should serve the dashboard 404 page for missing HTML GET requests', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    await devServer.instance.ready();

    const notFoundHtml = await fs.readFile(path.join(dashboardStaticPath, '404.html'), 'utf8');
    const response = await devServer.instance.inject({
      method: 'GET',
      url: '/missing-dashboard-page',
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
    const reportPath = path.join(FileStorage.getPath(projectRoot), 'analyze', 'ios-dev.html');
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

      const missingHtmlResponse = await devServer.instance.inject({
        method: 'GET',
        url: '/dashboard/analyze-report/missing.html',
        headers: {
          accept: 'text/html',
        },
      });

      expect(missingHtmlResponse.statusCode).toBe(404);
    } finally {
      await devServer.instance.close();
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('should expose MCP through Devframe', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      const origin = new URL(address).origin;
      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'rollipop-test', version: '1.0.0' },
        },
      };
      const response = await fetch(new URL('/__rollipop/__mcp', address), {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          origin,
        },
        body: JSON.stringify(initializeRequest),
      });

      expect(response.status).toBe(200);
      const sessionId = response.headers.get('mcp-session-id') ?? '';
      expect(sessionId).not.toBe('');
      expect(await response.text()).toContain('"name":"Rollipop"');

      const toolsResponse = await fetch(new URL('/__rollipop/__mcp', address), {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-session-id': sessionId,
          origin,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });

      expect(toolsResponse.status).toBe(200);
      const toolsPayload = await toolsResponse.text();
      expect(toolsPayload).toContain('"name":"get_bundler_status"');
      expect(toolsPayload).toContain('"name":"devframe_state_read"');

      const toolCallResponse = await fetch(new URL('/__rollipop/__mcp', address), {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-session-id': sessionId,
          origin,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'get_bundler_status', arguments: { bundlerId: 'missing' } },
        }),
      });

      expect(toolCallResponse.status).toBe(200);
      const toolCallPayload = await toolCallResponse.text();
      expect(toolCallPayload).toContain('not found');
      expect(toolCallPayload).not.toContain('"isError":true');
    } finally {
      await devServer.instance.close();
    }
  }, 10_000);

  it('should expose feature flags through Devframe RPC', async () => {
    const config = createTestConfig('/root/project');
    const devServer = await createDevServer(
      {
        ...config,
        analyzer: {
          ...config.analyzer,
          enabled: true,
        },
      },
      { port: 0 },
    );
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);

      await expect(client.scope('rollipop').rpc.call('get-feature-flags')).resolves.toEqual({
        analyze: true,
      });
    } finally {
      client?.close?.();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

  it('should trigger a bundler full build through Devframe RPC', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    const triggerFullBuild = vi.fn().mockResolvedValue(undefined);
    const getInstanceById = vi.spyOn(devServer.bundlerPool, 'getInstanceById').mockReturnValue({
      id: 'ios-dev',
      triggerFullBuild,
    } as unknown as BundlerDevEngine);
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);

      await expect(
        client.scope('rollipop').rpc.call('trigger-full-build', 'ios-dev'),
      ).resolves.toBeUndefined();
      expect(getInstanceById).toHaveBeenCalledWith('ios-dev');
      expect(triggerFullBuild).toHaveBeenCalledOnce();
    } finally {
      client?.close?.();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

  it('should expose and clear build logs through Devframe RPC', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);
      const rpc = client.scope('rollipop').rpc;

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

      const builds = (await rpc.call('get-builds')) as Array<{
        bundlerId: string;
      }>;

      expect(builds).toEqual([
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

      const bundlerId = builds[0]!.bundlerId;
      const logs = (await rpc.call('get-build-logs', bundlerId)) as unknown[];

      expect(logs).toHaveLength(5);
      expect(logs).toEqual(
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

      await expect(rpc.call('delete-build-logs', bundlerId)).resolves.toBeUndefined();
      await expect(rpc.call('get-build-logs', bundlerId)).resolves.toEqual([]);
      await expect(rpc.call('get-builds')).resolves.toEqual([
        expect.objectContaining({
          id: 'ios-dev',
          messages: {
            info: 0,
            warn: 0,
            error: 0,
          },
        }),
      ]);
    } finally {
      client?.close?.();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

  it('should expose empty logs for a known bundler through Devframe RPC', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
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
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);
      const rpc = client.scope('rollipop').rpc;

      await expect(rpc.call('get-build-logs', 'ios-dev')).resolves.toEqual([]);
      await expect(rpc.call('delete-build-logs', 'ios-dev')).resolves.toBeUndefined();
    } finally {
      client?.close?.();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

  it('should expose devices from the devtools target list through Devframe RPC', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(String(input), 'http://localhost');

      if (url.pathname === '/json/list') {
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
      }

      return originalFetch(input, init);
    });
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    let client: DevframeRpcClient | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);

      await expect(client.scope('rollipop').rpc.call('get-device', 'target-1')).resolves.toEqual(
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
    } finally {
      client?.close?.();
      fetchMock.mockRestore();
      vi.unstubAllGlobals();
      await devServer.instance.close();
    }
  }, 10_000);

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

  it('should invoke enabled `devtools.setup` hooks with the Rollipop context', async () => {
    const config = createTestConfig('/root/project');
    let context: RollipopDevToolsNodeContext | undefined;
    const setup = vi.fn((value: RollipopDevToolsNodeContext) => {
      context = value;
      value.docks.register({
        id: 'example',
        title: 'Example',
        icon: 'ph:puzzle-piece-duotone',
        type: 'iframe',
        url: '/__example/',
      });
    });
    const disabledSetup = vi.fn();
    config.plugins = [
      {
        name: 'enabled-devtools',
        devtools: { setup },
      },
      {
        name: 'disabled-devtools',
        devtools: {
          capabilities: { dev: false },
          setup: disabledSetup,
        },
      },
    ];

    const devServer = await createDevServer(config, { port: 0 });

    expect(setup).toHaveBeenCalledOnce();
    expect(disabledSetup).not.toHaveBeenCalled();
    expect(context?.rollipopConfig).toBe(config);
    expect(context?.rollipopServer).toBe(devServer);
    expect(context?.mode).toBe('dev');
    expect(context?.docks.values()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'example',
          title: 'Example',
          type: 'iframe',
          url: '/__example/',
        }),
      ]),
    );

    await devServer.instance.close();
  });
  async function connectDashboardRpc(address: string): Promise<DevframeRpcClient> {
    vi.stubGlobal('location', new URL(address));
    vi.stubGlobal('BroadcastChannel', undefined);

    const response = await fetch(new URL('/__rollipop/__connection.json', address));
    const connection: DevframeConnection = {
      connectionMeta: (await response.json()) as DevframeConnection['connectionMeta'],
      metaBaseUrl: response.url,
    };

    return connectDevframe({
      connection,
      transport: 'sse',
      simpleAuth: false,
      otpParam: false,
      callTimeout: 5_000,
    });
  }
});
