// oxlint-disable typescript-eslint(unbound-method)
import { describe, expect, it, vi, vitest } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
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
    expect(defaultRoutes).not.toContain('bundlers');

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
    expect(mcpRoutes).not.toContain('bundlers');
    await mcpServer.instance.close();
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
});
