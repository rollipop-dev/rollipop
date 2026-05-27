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
    expect(guide).toContain('"url": "http://127.0.0.1:9090/mcp"');
    expect(guide).toContain('get_build_events({ "duration": 10000 })');
    expect(guide).toContain('reset_cache()');
    expect(guide).toContain('/bundlers/<id>/status');
  });
});
