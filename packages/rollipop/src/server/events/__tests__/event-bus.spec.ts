import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { ServerEventBus } from '../event-bus';
import type { ServerEvent } from '../types';

describe('ServerEventBus', () => {
  let bus: ServerEventBus;

  beforeEach(() => {
    bus = new ServerEventBus();
  });

  it('notifies subscribed listeners', () => {
    const listener = vi.fn();
    const event: ServerEvent = { type: 'server_ready', host: 'localhost', port: 8081 };

    bus.subscribe(listener);
    bus.emit(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('stops notifying unsubscribed listeners', () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.emit({ type: 'cache_reset' });

    expect(listener).not.toHaveBeenCalled();
  });
});
