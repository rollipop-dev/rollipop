import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../event-bus';
import type { ReportableEvent } from '../types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('notifies subscribed listeners', () => {
    const listener = vi.fn();
    const event: ReportableEvent = { type: 'server_ready', host: 'localhost', port: 8081 };

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
