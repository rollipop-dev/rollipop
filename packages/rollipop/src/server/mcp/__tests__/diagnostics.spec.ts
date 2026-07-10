import { describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import { createTestConfig } from '../../../testing/config';
import { DevServerState } from '../../state/store';
import type { DevServerContext } from '../../types';
import type { WebSocketClient } from '../../wss/server';
import { AppLogDiagnostics } from '../tools/app-log-diagnostics';
import { BuildDiagnostics } from '../tools/build-diagnostics';
import { ClientDiagnostics } from '../tools/client-diagnostics';

function createTestContext(eventBus = new EventBus()): DevServerContext {
  const serverBaseUrl = 'http://localhost:8081';

  return {
    serverBaseUrl,
    config: createTestConfig('/root/project'),
    options: {},
    bundlerPool: {
      getInstanceById: vi.fn(),
    } as any,
    eventBus,
    state: new DevServerState({ eventBus }),
    message: {
      broadcast: vi.fn(),
    } as any,
    events: {
      reportEvent: vi.fn(),
    } as any,
    hot: {
      send: vi.fn(),
      sendAll: vi.fn(),
    } as any,
  };
}

describe('MCP diagnostics', () => {
  it('tracks HMR clients and client logs from server events', () => {
    const eventBus = new EventBus();
    const context = createTestContext(eventBus);
    const clientDiagnostics = new ClientDiagnostics(context);
    const appLogDiagnostics = new AppLogDiagnostics(context);
    const client = { id: 7 } as WebSocketClient;

    eventBus.emit({ type: 'client_connected', client });
    eventBus.emit({
      type: 'client_message',
      client,
      data: Buffer.from(
        JSON.stringify({
          type: 'hmr:connected',
          platform: 'ios',
          bundleEntry: 'index.bundle',
        }),
      ),
    });
    eventBus.emit({
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'info',
      data: ['hello', { ok: true }],
    });
    eventBus.emit({ type: 'client_disconnected', client });

    expect(clientDiagnostics.getClients()).toEqual([
      expect.objectContaining({
        id: 7,
        connected: false,
        platform: 'ios',
        bundleEntry: 'index.bundle',
      }),
    ]);
    expect(appLogDiagnostics.getConsoleLogs()).toEqual([
      expect.objectContaining({
        id: 1,
        source: 'client_log',
        level: 'info',
        bundlerId: 'ios-dev',
        args: ['hello', { ok: true }],
      }),
    ]);
  });

  it('buffers build diagnostics separately from app console logs', () => {
    const eventBus = new EventBus();
    const context = createTestContext(eventBus);
    const buildDiagnostics = new BuildDiagnostics(context);
    const appLogDiagnostics = new AppLogDiagnostics(context);
    const error = new Error('Unexpected token');

    eventBus.emit({ type: 'watch_change', bundlerId: 'ios-dev', id: '/App.tsx' });
    eventBus.emit({ type: 'bundle_build_started', bundlerId: 'ios-dev' });
    eventBus.emit({
      type: 'build_log',
      bundlerId: 'ios-dev',
      level: 'info',
      log: {
        code: 'PLUGIN_LOG',
        plugin: 'test-plugin',
        message: 'build info',
      },
    });
    eventBus.emit({
      type: 'build_error',
      bundlerId: 'ios-dev',
      level: 'warn',
      log: {
        code: 'PLUGIN_WARNING',
        plugin: 'test-plugin',
        message: 'build warning',
      },
    });
    eventBus.emit({ type: 'bundle_build_failed', bundlerId: 'ios-dev', error });
    eventBus.emit({ type: 'hmr_failed', bundlerId: 'ios-dev', error: new Error('HMR failed') });
    eventBus.emit({
      type: 'client_log',
      bundlerId: 'ios-dev',
      level: 'error',
      data: ['runtime error'],
    });

    expect(buildDiagnostics.getBuildLogs({ bundlerId: 'ios-dev' })).toEqual([
      expect.objectContaining({
        source: 'rolldown',
        level: 'info',
        bundlerId: 'ios-dev',
        log: expect.objectContaining({
          plugin: 'test-plugin',
          message: 'build info',
        }),
      }),
    ]);
    expect(buildDiagnostics.getBuildErrors()).toEqual([
      expect.objectContaining({
        source: 'rolldown',
        level: 'warn',
        bundlerId: 'ios-dev',
        log: expect.objectContaining({ message: 'build warning' }),
      }),
      expect.objectContaining({
        source: 'build',
        level: 'error',
        bundlerId: 'ios-dev',
        error: expect.objectContaining({ message: 'Unexpected token' }),
      }),
      expect.objectContaining({
        source: 'hmr',
        level: 'error',
        bundlerId: 'ios-dev',
        error: expect.objectContaining({ message: 'HMR failed' }),
      }),
    ]);
    expect(appLogDiagnostics.getConsoleLogs()).toEqual([
      expect.objectContaining({
        source: 'client_log',
        level: 'error',
        args: ['runtime error'],
      }),
    ]);

    buildDiagnostics.clearBuildLogs({ bundlerId: 'ios-dev' });
    buildDiagnostics.clearBuildErrors({ bundlerId: 'ios-dev' });
    appLogDiagnostics.clearConsoleLogs({ bundlerId: 'ios-dev' });

    expect(buildDiagnostics.getBuildLogs({ bundlerId: 'ios-dev' })).toEqual([]);
    expect(buildDiagnostics.getBuildErrors({ bundlerId: 'ios-dev' })).toEqual([]);
    expect(appLogDiagnostics.getConsoleLogs({ bundlerId: 'ios-dev' })).toEqual([]);
  });

  it('filters, clears, and bounds app console log buffers', () => {
    const eventBus = new EventBus();
    const appLogDiagnostics = new AppLogDiagnostics(createTestContext(eventBus));

    for (let index = 0; index < 501; index++) {
      eventBus.emit({
        type: 'client_log',
        bundlerId: index % 2 === 0 ? 'ios-dev' : 'android-dev',
        level: 'log',
        data: [`log-${index}`],
      });
    }

    expect(appLogDiagnostics.getConsoleLogs({ limit: 500 })).toHaveLength(500);
    expect(appLogDiagnostics.getConsoleLogs({ limit: 500 })[0]).toEqual(
      expect.objectContaining({ id: 2, args: ['log-1'] }),
    );
    expect(appLogDiagnostics.getConsoleLogs({ bundlerId: 'ios-dev', limit: 1 })).toEqual([
      expect.objectContaining({ bundlerId: 'ios-dev', args: ['log-500'] }),
    ]);

    appLogDiagnostics.clearConsoleLogs({ bundlerId: 'ios-dev' });

    expect(
      appLogDiagnostics
        .getConsoleLogs({ limit: 500 })
        .every((entry) => entry.bundlerId === 'android-dev'),
    ).toBe(true);
  });
});
