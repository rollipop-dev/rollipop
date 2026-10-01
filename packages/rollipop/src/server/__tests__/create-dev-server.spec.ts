// oxlint-disable typescript-eslint(unbound-method)
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDevMiddleware } from '@react-native/dev-middleware';
import { staticPath as dashboardStaticPath } from '@rollipop/dashboard';
import { connectDevframe, type DevframeConnection, type DevframeRpcClient } from 'devframe/client';
import { describe, expect, it, vi, vitest } from 'vite-plus/test';
import { WebSocket, WebSocketServer } from 'ws';

import { Bundler } from '../../core/bundler';
import type { RollipopDevToolsNodeContext } from '../../core/plugins/types';
import type { DevEngine } from '../../core/types';
import { EventBus } from '../../events/event-bus';
import { FileStorage } from '../../storage/file-storage';
import { createTestConfig } from '../../testing/config';
import * as nodeResolve from '../../utils/node-resolve';
import { type BundlerDevEngine, BundlerPool } from '../bundler-pool';
import { createDevServer } from '../create-dev-server';
import type { DashboardSharedState } from '../devframe';
import { logger } from '../logger';

vitest.mock('@react-native-community/cli-server-api', () => ({
  createDevServerMiddleware: vi.fn(() => {
    const messageServer = new WebSocketServer({ noServer: true });
    const eventsServer = new WebSocketServer({ noServer: true });
    return {
      middleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
      websocketEndpoints: { '/message': messageServer, '/events': eventsServer },
      messageSocketEndpoint: {
        server: messageServer,
        broadcast: vi.fn(),
      },
      eventsSocketEndpoint: {
        server: eventsServer,
        reportEvent: vi.fn(),
      },
    };
  }),
}));

vitest.mock('@react-native/dev-middleware', () => ({
  createDevMiddleware: vi.fn().mockReturnValue({
    middleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    websocketEndpoints: {},
  }),
}));

describe('createDevServer', () => {
  it('closes active WebSocket connections before shutting down the HTTP server', async () => {
    const inspectorServer = new WebSocketServer({ noServer: true });
    vi.mocked(createDevMiddleware).mockReturnValueOnce({
      middleware: (_req: unknown, _res: unknown, next: () => void) => next(),
      websocketEndpoints: {
        '/inspector/device': inspectorServer,
        '/inspector/debug': inspectorServer,
      },
    });
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    const servers = [devServer.message, devServer.events, devServer.hot, inspectorServer];
    const closeSpies = servers.map((server) => vi.spyOn(server, 'close'));
    const clients: WebSocket[] = [];

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      for (const endpoint of [
        '/message',
        '/events',
        '/hot',
        '/inspector/device',
        '/inspector/debug',
      ]) {
        const client = new WebSocket(address.replace('http:', 'ws:') + endpoint);
        clients.push(client);
        client.on('error', () => {});
        await once(client, 'open', { signal: AbortSignal.timeout(2_000) });
      }
      expect(servers.map((server) => server.clients.size)).toEqual([1, 1, 1, 2]);

      const clientsClosed = clients.map((client) =>
        once(client, 'close', { signal: AbortSignal.timeout(2_000) }),
      );
      await Promise.all([devServer.instance.close(), ...clientsClosed]);

      expect(devServer.instance.server.listening).toBe(false);
      expect(servers.every((server) => server.clients.size === 0)).toBe(true);
      expect(clients.every((client) => client.readyState === WebSocket.CLOSED)).toBe(true);
      for (const close of closeSpies) {
        expect(close).toHaveBeenCalledOnce();
      }
    } finally {
      for (const client of clients) {
        client.terminate();
      }
      await devServer.instance.close();
      for (const close of closeSpies) {
        close.mockRestore();
      }
    }
  });

  it('closes active Devframe SSE streams before shutting down the HTTP server', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    const controller = new AbortController();

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(new URL('/__rollipop/__sse', address), {
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const streamDone = response.text();
      const serverClosed = once(devServer.instance.server, 'close', {
        signal: AbortSignal.timeout(2_000),
      });
      await Promise.all([devServer.instance.close(), serverClosed, streamDone]);

      expect(await streamDone).toContain('event: session');
      expect(devServer.instance.server.listening).toBe(false);
    } finally {
      controller.abort();
      await devServer.instance.close();
    }
  });

  it.each(['127.0.0.1', '::1'])(
    'should announce localhost URLs with the bound port after listening on %s',
    async (host) => {
      const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
      const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });

      try {
        await devServer.instance.ready();
        expect(info).not.toHaveBeenCalled();

        const address = await devServer.instance.listen({ host, port: 0 });
        const displayAddress = `http://localhost:${new URL(address).port}`;

        expect(info).toHaveBeenCalledWith(
          `MCP server listening at ${displayAddress}/__rollipop/__mcp`,
        );
        expect(info).toHaveBeenCalledWith(`Dashboard is available at ${displayAddress}/dashboard`);
      } finally {
        await devServer.instance.close();
        info.mockRestore();
      }
    },
  );

  it('keeps MCP disabled without logging when the optional agentic package is missing', async () => {
    const resolveFrom = nodeResolve.resolveFrom;
    const resolve = vi.spyOn(nodeResolve, 'resolveFrom').mockImplementation((base, specifier) => {
      if (specifier === '@devframes/agentic/package.json') {
        throw new Error('Cannot find module @devframes/agentic/package.json');
      }
      return resolveFrom(base, specifier);
    });
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let devServer: Awaited<ReturnType<typeof createDevServer>> | undefined;

    try {
      devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      const connection = await fetch(new URL('/__rollipop/__connection.json', address));
      expect(connection.status).toBe(200);
      const meta = await connection.json();
      expect(meta).toMatchObject({
        backend: 'sse',
        sse: { path: '/__rollipop/__sse' },
      });
      expect(meta).not.toHaveProperty('mcp');
      const mcp = await fetch(new URL('/__rollipop/__mcp', address), { method: 'POST' });
      expect(mcp.status).toBe(404);
      expect(info).not.toHaveBeenCalledWith(expect.stringContaining('MCP server listening'));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await devServer?.instance.close();
      resolve.mockRestore();
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it.each([
    { buildOptions: { cache: false }, expectedCache: false },
    { buildOptions: { cache: true }, expectedCache: true },
    { buildOptions: {}, expectedCache: true },
    { buildOptions: undefined, expectedCache: true },
  ])(
    'should use cache=$expectedCache with buildOptions=$buildOptions',
    async ({ buildOptions, expectedCache }) => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rollipop-server-cache-'));
      const devEngine = vi.spyOn(Bundler, 'devEngine').mockResolvedValue({
        run: vi.fn().mockResolvedValue(undefined),
        getContext: () => ({ eventBus: new EventBus() }),
      } as unknown as DevEngine);
      const devServer = await createDevServer(createTestConfig(projectRoot), {
        port: 0,
        buildOptions,
      });

      try {
        const bundler = devServer.bundlerPool.get('index.bundle', { platform: 'ios', dev: true });
        await bundler.ensureInitialized;

        expect(bundler.buildOptions.cache).toBe(expectedCache);
        expect(devEngine).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.objectContaining({ platform: 'ios', dev: true, cache: expectedCache }),
          expect.anything(),
        );
      } finally {
        devEngine.mockRestore();
        (BundlerPool as any).instances.clear();
        await devServer.instance.close();
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    },
  );

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

  it('preserves each lifecycle event while dashboard refreshes are queued', async () => {
    const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
    let client: DevframeRpcClient | undefined;
    let unsubscribe: (() => void) | undefined;

    try {
      const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
      client = await connectDashboardRpc(address);
      await client.ensureTrusted();
      const state = await client
        .scope('rollipop')
        .rpc.sharedState<DashboardSharedState>('dashboard');
      const events: NonNullable<DashboardSharedState['lastEvent']>[] = [];
      unsubscribe = state.on('updated', (value) => {
        if (value.lastEvent != null) events.push(value.lastEvent);
      });

      devServer.eventBus.emit({ type: 'bundle_build_started', bundlerId: 'test' });
      devServer.eventBus.emit({
        type: 'bundle_build_done',
        bundlerId: 'test',
        totalModules: 1,
        transformedModules: 1,
        cacheHitModules: 0,
        duration: 1,
      });
      devServer.eventBus.emit({ type: 'watch_change', bundlerId: 'test', id: '/output.bundle' });

      await expect
        .poll(() => events.map((event) => event.data.type))
        .toEqual(['bundle_build_started', 'bundle_build_done', 'watch_change']);
      expect(events.map((event) => event.sequence)).toEqual([
        events[0]!.sequence,
        events[0]!.sequence + 1,
        events[0]!.sequence + 2,
      ]);
    } finally {
      unsubscribe?.();
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
      expect(response.headers.get('mcp-session-id')).toBeNull();
      expect(await response.text()).toContain('"name":"Rollipop"');

      const toolsResponse = await fetch(new URL('/__rollipop/__mcp', address), {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
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

  it.each(['close', 'terminate'] as const)(
    'updates dashboard devices when an inspector socket disconnects via %s without HMR',
    async (disconnect) => {
      const inspectorServer = new WebSocketServer({ noServer: true });
      const targets = new Map<WebSocket, { id: string; title: string }>();
      inspectorServer.on('connection', (socket, request) => {
        const id = new URL(request.url!, 'http://localhost').searchParams.get('device')!;
        targets.set(socket, { id, title: id });
        socket.once('close', () => targets.delete(socket));
      });
      vi.mocked(createDevMiddleware).mockReturnValueOnce({
        middleware: (_req: unknown, _res: unknown, next: () => void) => next(),
        websocketEndpoints: { '/inspector/device': inspectorServer },
      });
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        return url.pathname === '/json/list'
          ? Promise.resolve(Response.json([...targets.values()]))
          : originalFetch(input, init);
      });
      const devServer = await createDevServer(createTestConfig('/root/project'), { port: 0 });
      const devices: WebSocket[] = [];
      let client: DevframeRpcClient | undefined;

      try {
        const address = await devServer.instance.listen({ host: '127.0.0.1', port: 0 });
        client = await connectDashboardRpc(address);
        await client.ensureTrusted();
        const state = await client
          .scope('rollipop')
          .rpc.sharedState<DashboardSharedState>('dashboard');

        for (const id of ['device-1', 'device-2']) {
          const socket = new WebSocket(
            `${address.replace('http:', 'ws:')}/inspector/device?device=${id}`,
          );
          devices.push(socket);
          await once(socket, 'open', { signal: AbortSignal.timeout(2_000) });
        }
        await client.scope('rollipop').rpc.call('get-snapshot');
        await expect
          .poll(() => state.value().snapshot.devices.map(({ id }) => id))
          .toEqual(['device-1', 'device-2']);
        expect(devServer.hot.clients.size).toBe(0);

        devices[0]![disconnect]();

        // Observe pushed shared state only; no manual snapshot request or HMR event.
        await expect
          .poll(() => state.value().snapshot.devices.map(({ id }) => id))
          .toEqual(['device-2']);

        // A server-side termination (for example, an Inspector heartbeat timeout) also refreshes.
        for (const socket of inspectorServer.clients) socket.terminate();
        await expect.poll(() => state.value().snapshot.devices).toEqual([]);
      } finally {
        for (const socket of devices) socket.terminate();
        client?.close?.();
        await devServer.instance.close();
        fetchMock.mockRestore();
        vi.unstubAllGlobals();
      }
    },
    10_000,
  );

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
