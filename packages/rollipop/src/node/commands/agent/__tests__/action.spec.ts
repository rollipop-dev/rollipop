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
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8081/__rollipop/__mcp'),
    );
  });

  it('documents the available agent integrations', () => {
    const guide = getAgentGuide('http://127.0.0.1:9090');

    expect(command.name).toBe('agent');
    expect(command.helpText).toContain('Rollipop Agent Guide');
    expect(guide).toContain('Rollipop ships bundled Markdown skills for coding agents');
    expect(guide).toContain('rollipop start --reset-cache');
    expect(guide).toContain('rollipop skills list');
    expect(guide).toContain('rollipop skills get <name>');
    expect(guide).toContain('"url": "http://127.0.0.1:9090/__rollipop/__mcp"');
    expect(guide).toContain('"Origin": "http://127.0.0.1:9090"');
    expect(guide).toContain('MCP clients discover supported tools by calling tools/list');
    expect(guide).toContain('https://github.com/callstackincubator/agent-cdp');
    expect(guide).toContain('https://github.com/callstackincubator/agent-react-devtools');
    expect(guide).toContain('CDP debugging, runtime evaluation, runtime errors');
    expect(guide).toContain('React component tree inspection and React DevTools profiling');
    expect(guide).toContain('get_bundler_status');
    expect(guide).toContain('get_console_logs');
    expect(guide).toContain('bundler-scoped events include bundlerId');
  });
});
