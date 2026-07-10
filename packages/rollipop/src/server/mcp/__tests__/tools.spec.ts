import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import { createTestConfig } from '../../../testing/config';
import { DevServerState } from '../../state/store';
import type { DevServerContext } from '../../types';
import { registerTools, type McpToolContext } from '../tools';
import { AppLogDiagnostics } from '../tools/app-log-diagnostics';
import { BuildDiagnostics } from '../tools/build-diagnostics';
import { ClientDiagnostics } from '../tools/client-diagnostics';

interface ToolCallResult {
  content: Array<{ text: string }>;
}

interface ToolListResult {
  tools: Array<{ name: string; description?: string }>;
}

type RequestHandler = (request?: {
  params?: { name?: string; arguments?: Record<string, unknown> };
}) => unknown;

class FakeMcpServer {
  readonly handlers: RequestHandler[] = [];

  readonly server = {
    registerCapabilities: vi.fn(),
    setRequestHandler: vi.fn((_schema: unknown, handler: RequestHandler) => {
      this.handlers.push(handler);
    }),
  };

  async listTools(): Promise<ToolListResult> {
    return (await this.handlers[0]?.()) as ToolListResult;
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult> {
    return (await this.handlers[1]?.({
      params: {
        name,
        arguments: args,
      },
    })) as ToolCallResult;
  }
}

function createTestContext(
  eventBus: EventBus,
  bundlerPool: DevServerContext['bundlerPool'],
): DevServerContext {
  const serverBaseUrl = 'http://localhost:8081';

  return {
    serverBaseUrl,
    config: createTestConfig('/root/project'),
    options: {},
    bundlerPool,
    eventBus,
    state: new DevServerState({ eventBus }),
    message: {
      broadcast: vi.fn(),
    } as any,
    events: {
      reportEvent: vi.fn(),
    } as any,
    hot: {
      send: vi.fn(),
      sendAll: vi.fn(),
    } as any,
  };
}

describe('MCP tools', () => {
  function createMcpContext(devServerContext: DevServerContext): McpToolContext {
    return {
      context: devServerContext,
      appLogDiagnostics: new AppLogDiagnostics(devServerContext),
      buildDiagnostics: new BuildDiagnostics(devServerContext),
      clientDiagnostics: new ClientDiagnostics(devServerContext),
    };
  }

  it('returns bundler status through MCP instead of an HTTP status route', async () => {
    const eventBus = new EventBus();
    const server = new FakeMcpServer();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn((id: string) =>
        id === 'abc' ? { id: 'abc', status: 'build-done' } : undefined,
      ),
    } as any);
    const context = createMcpContext(devServerContext);

    registerTools(server as unknown as McpServer, context);

    await expect(server.callTool('get_bundler_status', { bundlerId: 'abc' })).resolves.toEqual({
      content: [
        { type: 'text', text: JSON.stringify({ id: 'abc', status: 'build-done' }, null, 2) },
      ],
    });
    await expect(server.callTool('get_bundler_status', { bundlerId: 'missing' })).resolves.toEqual({
      content: [{ type: 'text', text: JSON.stringify({ error: 'not found' }, null, 2) }],
    });
  });

  it('keeps MCP runtime tools scoped to HMR-forwarded console logs', async () => {
    const eventBus = new EventBus();
    const server = new FakeMcpServer();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createMcpContext(devServerContext);

    registerTools(server as unknown as McpServer, context);

    const toolNames = new Set((await server.listTools()).tools.map((tool) => tool.name));

    expect(toolNames.has('get_console_logs')).toBe(true);
    expect(toolNames.has('clear_console_logs')).toBe(true);
    expect(toolNames.has('get_runtime_errors')).toBe(false);
    expect(toolNames.has('clear_runtime_errors')).toBe(false);
    expect(toolNames.has('evaluate')).toBe(false);
    expect(toolNames.has('get_app_info')).toBe(false);
    expect(toolNames.has('get_connection_status')).toBe(false);
    expect(toolNames.has('get_network_requests')).toBe(false);
    expect(toolNames.has('start_react_profiling')).toBe(false);
    expect(toolNames.has('start_profiling')).toBe(false);
  });

  it('keeps MCP tool descriptions concise', async () => {
    const eventBus = new EventBus();
    const server = new FakeMcpServer();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createMcpContext(devServerContext);

    registerTools(server as unknown as McpServer, context);

    const tools = await server.listTools();
    expect(tools.tools.find((tool) => tool.name === 'build_logs')?.description).toBe(
      'Return buffered Rolldown logs.',
    );
    expect(tools.tools.find((tool) => tool.name === 'clear_build_errors')?.description).toBe(
      'Clear buffered Rolldown errors.',
    );
  });

  it('returns and clears HMR-forwarded console logs', async () => {
    const eventBus = new EventBus();
    const server = new FakeMcpServer();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createMcpContext(devServerContext);

    registerTools(server as unknown as McpServer, context);

    eventBus.emit({
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'info',
      data: ['hello', { ok: true }],
    });
    eventBus.emit({
      type: 'client_log',
      bundlerId: 'android-dev',
      level: 'warn',
      data: ['other'],
    });

    const result = await server.callTool('get_console_logs', { limit: 10, bundlerId: 'ios-dev' });
    expect(JSON.parse(result.content[0]!.text)).toEqual([
      expect.objectContaining({
        id: 1,
        source: 'client_log',
        bundlerId: 'ios-dev',
        level: 'info',
        args: ['hello', { ok: true }],
      }),
    ]);

    await server.callTool('clear_console_logs', { bundlerId: 'ios-dev' });

    const afterClear = await server.callTool('get_console_logs', { limit: 10 });
    expect(JSON.parse(afterClear.content[0]!.text)).toEqual([
      expect.objectContaining({
        source: 'client_log',
        bundlerId: 'android-dev',
        args: ['other'],
      }),
    ]);
  });

  it('excludes client logs from get_build_events', async () => {
    const eventBus = new EventBus();
    const server = new FakeMcpServer();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createMcpContext(devServerContext);

    registerTools(server as unknown as McpServer, context);

    const resultPromise = server.callTool('get_build_events', { duration: 1000 });
    eventBus.emit({
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'info',
      data: ['hello'],
    });
    eventBus.emit({ type: 'watch_change', bundlerId: 'ios-dev', id: '/App.tsx' });
    eventBus.emit({ type: 'hmr_failed', bundlerId: 'ios-dev', error: new Error('HMR failed') });

    const result = await resultPromise;
    const events = JSON.parse(result.content[0]!.text);
    expect(events).toEqual([
      { type: 'watch_change', bundlerId: 'ios-dev', file: '/App.tsx' },
      { type: 'hmr_failed', bundlerId: 'ios-dev', error: 'HMR failed' },
    ]);
  });
});
