import mitt from 'mitt';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { DevServerEvents } from '../../server/types';
import {
  createDevServerEventListener,
  createReactNativeEventListener,
  createReporterEventListener,
} from '../consumers';
import type { ReportableEvent } from '../types';

describe('event consumers', () => {
  it('forwards events to configured reporters', () => {
    const reporter = { update: vi.fn() };
    const listener = createReporterEventListener(reporter);
    const buildEvent = {
      type: 'bundle_build_started',
      bundlerId: 'ios-dev',
    } satisfies ReportableEvent;
    const hmrEvent = {
      type: 'hmr_updates',
      bundlerId: 'ios-dev',
      updates: [],
      changedFiles: ['/App.tsx'],
    } satisfies ReportableEvent;
    const clientLogEvent = {
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'log',
      data: ['hello'],
    } satisfies ReportableEvent;

    listener(buildEvent);
    listener(hmrEvent);
    listener(clientLogEvent);
    const serverReadyEvent = { type: 'server_ready', host: 'localhost', port: 8081 } as const;
    listener(serverReadyEvent);

    expect(reporter.update).toHaveBeenCalledWith(buildEvent);
    expect(reporter.update).toHaveBeenCalledWith(hmrEvent);
    expect(reporter.update).toHaveBeenCalledWith(clientLogEvent);
    expect(reporter.update).toHaveBeenCalledWith(serverReadyEvent);
    expect(reporter.update).toHaveBeenCalledTimes(4);
  });

  it('forwards client logs to the React Native event reporter', () => {
    const reportEvent = vi.fn();
    const listener = createReactNativeEventListener(reportEvent);
    const clientLogEvent = {
      type: 'client_log',
      level: 'log',
      data: ['hello'],
    } satisfies ReportableEvent;

    listener(clientLogEvent);
    listener({ type: 'server_ready', host: 'localhost', port: 8081 });

    expect(reportEvent).toHaveBeenCalledWith(clientLogEvent);
    expect(reportEvent).toHaveBeenCalledTimes(1);
  });

  it('adapts client events to the public dev-server emitter', () => {
    const emitter = mitt<DevServerEvents>();
    const listener = createDevServerEventListener(emitter);
    const onConnected = vi.fn();
    const client = { id: 1 };

    emitter.on('client.connected', onConnected);
    listener({ type: 'client_connected', client } as any);
    listener({ type: 'server_ready', host: 'localhost', port: 8081 });

    expect(onConnected).toHaveBeenCalledWith({ client });
    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});
