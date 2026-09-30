import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { ReportableEvent, Reporter } from '../../../../types';
import type { StartCommandOptions } from '../command';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resetCache: vi.fn(),
  runServer: vi.fn(),
  setupInteractiveMode: vi.fn(),
}));

vi.mock('../../../../config', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../../../../utils/reset-cache', () => ({ resetCache: mocks.resetCache }));
vi.mock('../../../../utils/run-server', () => ({ runServer: mocks.runServer }));
vi.mock('../setup-interactive-mode', () => ({ setupInteractiveMode: mocks.setupInteractiveMode }));

import { action } from '../action';

describe('start command action', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('suppresses only client logs while preserving reporter events and its receiver', async () => {
    const reporter = {
      events: [] as ReportableEvent[],
      update(event: ReportableEvent) {
        this.events.push(event);
      },
    };
    const config: { reporter: Reporter } = { reporter };
    mocks.loadConfig.mockResolvedValue(config);

    await action.call({ platforms: ['ios'] }, { interactive: false, clientLogs: false });

    expect(mocks.runServer).toHaveBeenCalledWith(config, expect.any(Object));
    const events: ReportableEvent[] = [
      { type: 'server_ready', host: 'localhost', port: 8081 },
      { type: 'bundle_build_started' },
      { type: 'build_error', level: 'error', log: { message: 'build failed' } },
      { type: 'hmr_failed', error: new Error('update failed') },
    ];
    config.reporter.update({ type: 'client_log', level: 'log', data: ['hidden'] });
    for (const event of events) {
      config.reporter.update(event);
    }

    expect(reporter.events).toEqual(events);
  });

  it.each([true, undefined])(
    'keeps the reporter unchanged for clientLogs=%s',
    async (clientLogs) => {
      const reporter = { update: vi.fn() };
      const config = { reporter };
      mocks.loadConfig.mockResolvedValue(config);

      await action.call({ platforms: ['ios'] }, {
        interactive: false,
        clientLogs,
      } as StartCommandOptions);
      const event: ReportableEvent = { type: 'client_log', level: 'log', data: ['visible'] };
      config.reporter.update(event);

      expect(config.reporter).toBe(reporter);
      expect(reporter.update).toHaveBeenCalledExactlyOnceWith(event);
    },
  );

  it('supports configs without a reporter when client logs are disabled', async () => {
    const config: { reporter?: Reporter } = {};
    mocks.loadConfig.mockResolvedValue(config);

    await action.call({ platforms: ['ios'] }, { interactive: false, clientLogs: false });

    expect(config.reporter).toBeUndefined();
    expect(mocks.runServer).toHaveBeenCalledWith(config, expect.any(Object));
  });
});
