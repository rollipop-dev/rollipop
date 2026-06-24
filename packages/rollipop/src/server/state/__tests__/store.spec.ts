import { describe, expect, it } from 'vite-plus/test';

import { ServerEventBus } from '../../events/event-bus';
import { DevServerState } from '../store';

describe('DevServerState', () => {
  it('limits retained build logs to 1000 entries', () => {
    const eventBus = new ServerEventBus();
    const state = new DevServerState({ eventBus });

    for (let index = 0; index < 1005; index += 1) {
      if (index % 2 === 0) {
        eventBus.emit({
          type: 'build_log',
          bundlerId: 'ios-dev',
          level: 'info',
          log: {
            message: `log ${index}`,
          },
        });
        continue;
      }

      eventBus.emit({
        type: 'build_error',
        bundlerId: 'ios-dev',
        level: 'warn',
        log: {
          message: `log ${index}`,
        },
      });
    }

    expect(state.getBuildLogs('ios-dev')).toHaveLength(1000);
    expect(state.getBuildLogs('ios-dev')?.[0]?.message).toBe('log 5');
    expect(state.getBuildLogs('ios-dev')?.at(-1)?.message).toBe('log 1004');
    expect(state.getBuild('ios-dev')?.messages).toEqual({
      info: 500,
      warn: 500,
      error: 0,
    });
  });
});
