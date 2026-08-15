import type { DevframeAgentHost } from 'devframe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../../../../events/event-bus';
import { createTestConfig } from '../../../../testing/config';
import { DevServerState } from '../../../state/store';
import type { DevServerContext } from '../../../types';
import { registerAgentTools, type AgentToolContext } from '../tools';
import { AppLogDiagnostics } from '../tools/app-log-diagnostics';
import { BuildDiagnostics } from '../tools/build-diagnostics';
import { ClientDiagnostics } from '../tools/client-diagnostics';

interface RegisteredAgentTool {
  id: string;
  description: string;
  handler: (args: Record<string, unknown>) => unknown;
}

class FakeAgentHost {
  private readonly tools = new Map<string, RegisteredAgentTool>();

  registerTool(tool: RegisteredAgentTool) {
    this.tools.set(tool.id, tool);
    return { unregister: () => this.tools.delete(tool.id) };
  }

  listTools(): RegisteredAgentTool[] {
    return Array.from(this.tools.values());
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const tool = this.tools.get(name);
    if (tool == null) {
      throw new Error(`Tool ${name} not found`);
    }
    return await tool.handler(args);
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

describe('Devframe agent tools', () => {
  function createAgentContext(devServerContext: DevServerContext): AgentToolContext {
    return {
      context: devServerContext,
      appLogDiagnostics: new AppLogDiagnostics(devServerContext),
      buildDiagnostics: new BuildDiagnostics(devServerContext),
      clientDiagnostics: new ClientDiagnostics(devServerContext),
    };
  }

  it('returns bundler status through MCP instead of an HTTP status route', async () => {
    const eventBus = new EventBus();
    const agent = new FakeAgentHost();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn((id: string) =>
        id === 'abc' ? { id: 'abc', status: 'build-done' } : undefined,
      ),
    } as any);
    const context = createAgentContext(devServerContext);

    registerAgentTools(agent as unknown as DevframeAgentHost, context);

    await expect(agent.callTool('get_bundler_status', { bundlerId: 'abc' })).resolves.toEqual({
      id: 'abc',
      status: 'build-done',
    });
    await expect(agent.callTool('get_bundler_status', { bundlerId: 'missing' })).resolves.toEqual({
      error: 'not found',
    });
  });

  it('keeps MCP runtime tools scoped to HMR-forwarded console logs', async () => {
    const eventBus = new EventBus();
    const agent = new FakeAgentHost();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createAgentContext(devServerContext);

    registerAgentTools(agent as unknown as DevframeAgentHost, context);

    const toolNames = new Set(agent.listTools().map((tool) => tool.id));

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
    const agent = new FakeAgentHost();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createAgentContext(devServerContext);

    registerAgentTools(agent as unknown as DevframeAgentHost, context);

    const tools = agent.listTools();
    expect(tools.find((tool) => tool.id === 'build_logs')?.description).toBe(
      'Return buffered Rolldown logs.',
    );
    expect(tools.find((tool) => tool.id === 'clear_build_errors')?.description).toBe(
      'Clear buffered Rolldown errors.',
    );
  });

  it('returns and clears HMR-forwarded console logs', async () => {
    const eventBus = new EventBus();
    const agent = new FakeAgentHost();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createAgentContext(devServerContext);

    registerAgentTools(agent as unknown as DevframeAgentHost, context);

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

    const result = await agent.callTool('get_console_logs', { limit: 10, bundlerId: 'ios-dev' });
    expect(result).toEqual([
      expect.objectContaining({
        id: 1,
        source: 'client_log',
        bundlerId: 'ios-dev',
        level: 'info',
        args: ['hello', { ok: true }],
      }),
    ]);

    await agent.callTool('clear_console_logs', { bundlerId: 'ios-dev' });

    const afterClear = await agent.callTool('get_console_logs', { limit: 10 });
    expect(afterClear).toEqual([
      expect.objectContaining({
        source: 'client_log',
        bundlerId: 'android-dev',
        args: ['other'],
      }),
    ]);
  });

  it('excludes client logs from get_build_events', async () => {
    const eventBus = new EventBus();
    const agent = new FakeAgentHost();
    const devServerContext = createTestContext(eventBus, {
      getInstanceById: vi.fn(),
    } as any);
    const context = createAgentContext(devServerContext);

    registerAgentTools(agent as unknown as DevframeAgentHost, context);

    const resultPromise = agent.callTool('get_build_events', { duration: 1000 });
    eventBus.emit({
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'info',
      data: ['hello'],
    });
    eventBus.emit({ type: 'watch_change', bundlerId: 'ios-dev', id: '/App.tsx' });
    eventBus.emit({ type: 'hmr_failed', bundlerId: 'ios-dev', error: new Error('HMR failed') });

    const result = await resultPromise;
    expect(result).toEqual([
      { type: 'watch_change', bundlerId: 'ios-dev', file: '/App.tsx' },
      { type: 'hmr_failed', bundlerId: 'ios-dev', error: 'HMR failed' },
    ]);
  });
});
