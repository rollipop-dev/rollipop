import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { action, getAgentGuide } from '../action';
import { command } from '../command';

describe('agent command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the Rollipop agent guide', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await action.call({ platforms: ['ios', 'android'] }, {});

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Rollipop Agent Guide'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:8081/sse/events'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:8081/mcp'));
  });

  it('documents the available agent integrations', () => {
    const guide = getAgentGuide('http://127.0.0.1:9090');

    expect(command.name).toBe('agent');
    expect(command.helpText).toContain('Rollipop Agent Guide');
    expect(guide).toContain('curl -N http://127.0.0.1:9090/sse/events');
    expect(guide).toContain('curl -N http://127.0.0.1:9090/sse/client-logs');
    expect(guide).toContain('rollipop start --mcp --reset-cache');
    expect(guide).toContain('"url": "http://127.0.0.1:9090/mcp"');
    expect(guide).toContain('requires start --mcp');
    expect(guide).toContain('MCP clients discover supported tools by calling tools/list');
    expect(guide).toContain('https://github.com/callstackincubator/agent-cdp');
    expect(guide).toContain('https://github.com/callstackincubator/agent-react-devtools');
    expect(guide).toContain('CDP debugging, runtime evaluation, runtime errors');
    expect(guide).toContain('React component tree inspection and React DevTools profiling');
    expect(guide).toContain('client_log is streamed separately from /sse/client-logs');
    expect(guide).not.toContain('Runtime checks:');
    expect(guide).toContain('get_bundler_status');
    expect(guide).not.toContain('/reset-cache');
    expect(guide).not.toContain('/bundlers/<id>/status');
    expect(guide).toContain('bundler-scoped events include bundlerId');
  });
});
