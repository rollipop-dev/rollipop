import { describe, expect, it } from 'vite-plus/test';

import type { ReportableEvent } from '../src/types';
import { build } from './helpers';

describe('reporter', () => {
  it('receives lifecycle events from regular builds', async () => {
    const events: ReportableEvent[] = [];

    await build('bundle-output/prelude', {
      reporter: {
        update(event: ReportableEvent) {
          events.push(event);
        },
      },
    });

    expect(events[0]?.type).toBe('bundle_build_started');
    expect(events.some((event) => event.type === 'transform')).toBe(true);
    expect(events[events.length - 1]?.type).toBe('bundle_build_done');
    expect(events.some((event) => 'bundlerId' in event && event.bundlerId != null)).toBe(false);
  });
});
