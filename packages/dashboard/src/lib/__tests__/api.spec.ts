import { connectDevframe } from 'devframe/client';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { DashboardEventsState } from '../api';

vi.mock('devframe/client', () => ({ connectDevframe: vi.fn() }));

describe('dashboard data requests', () => {
  const call = vi.fn();
  const unsubscribeState = vi.fn();
  const unsubscribeStatus = vi.fn();
  let updateState: (state: DashboardEventsState) => void;
  const sharedState = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sharedState.mockResolvedValue({
      value: () => ({ lastEvent: { sequence: 1, data: { type: 'server_ready' } } }),
      on: vi.fn((_event, callback) => {
        updateState = callback;
        return unsubscribeState;
      }),
    });
    vi.mocked(connectDevframe).mockResolvedValue({
      status: 'connected',
      ensureTrusted: vi.fn().mockResolvedValue(true),
      events: { on: vi.fn(() => unsubscribeStatus) },
      scope: vi.fn(() => ({ rpc: { call, sharedState } })),
    } as unknown as Awaited<ReturnType<typeof connectDevframe>>);
  });

  it('subscribes only to notifications without fetching dashboard data', async () => {
    const { subscribeDashboardEvents } = await import('../api');
    const onEvent = vi.fn();
    const onConnectionStatus = vi.fn();
    const dispose = await subscribeDashboardEvents({ onEvent, onConnectionStatus });

    expect(sharedState).toHaveBeenCalledWith('events');
    expect(call).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onConnectionStatus).toHaveBeenCalledWith('connected');
    dispose();
    expect(unsubscribeState).toHaveBeenCalledOnce();
    expect(unsubscribeStatus).toHaveBeenCalledOnce();
  });

  it('forwards each new notification without prefetching a snapshot', async () => {
    const { subscribeDashboardEvents } = await import('../api');
    const onEvent = vi.fn();
    const dispose = await subscribeDashboardEvents({ onEvent });

    updateState({ lastEvent: { sequence: 2, data: { type: 'client_connected' } } });
    updateState({ lastEvent: { sequence: 2, data: { type: 'client_connected' } } });
    updateState({ lastEvent: { sequence: 3, data: { type: 'devices_changed' } } });

    expect(onEvent.mock.calls).toEqual([
      [{ type: 'client_connected' }],
      [{ type: 'devices_changed' }],
    ]);
    expect(call).not.toHaveBeenCalled();
    dispose();
  });

  it('fetches a snapshot only when requested by the mounted dashboard', async () => {
    const { getDashboardSnapshot } = await import('../api');
    call.mockResolvedValue({ devices: [] });

    await expect(getDashboardSnapshot()).resolves.toEqual({ devices: [] });
    expect(call).toHaveBeenCalledExactlyOnceWith('get-snapshot');
    expect(sharedState).not.toHaveBeenCalled();
  });
});
