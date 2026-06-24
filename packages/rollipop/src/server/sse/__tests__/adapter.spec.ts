import { describe, expect, it } from 'vite-plus/test';

import type { ReportableEvent } from '../../../types';
import type { IdentifiedReportableEvent } from '../../events/types';
import type { WebSocketClient } from '../../wss/server';
import { toSSEClientLogEvent, toSSEEvent } from '../adapter';

describe('toSSEEvent', () => {
  const bundlerId = 'ios-true';

  it('should convert bundle_build_started with bundlerId', () => {
    const event: IdentifiedReportableEvent = { type: 'bundle_build_started', bundlerId };

    expect(toSSEEvent(event)).toEqual({
      type: 'bundle_build_started',
      bundlerId: 'ios-true',
    });
  });

  it('should convert bundle_build_done with bundlerId', () => {
    const event: IdentifiedReportableEvent = {
      type: 'bundle_build_done',
      bundlerId,
      totalModules: 100,
      transformedModules: 70,
      cacheHitModules: 30,
      duration: 500,
      bundleFilePath: '/tmp/.rollipop/bundles/ios-true.bundle',
    };

    expect(toSSEEvent(event)).toEqual({
      type: 'bundle_build_done',
      bundlerId: 'ios-true',
      totalModules: 100,
      transformedModules: 70,
      cacheHitModules: 30,
      duration: 500,
      bundleFilePath: '/tmp/.rollipop/bundles/ios-true.bundle',
    });
  });

  it('should serialize Error to string for bundle_build_failed', () => {
    const event: IdentifiedReportableEvent = {
      type: 'bundle_build_failed',
      bundlerId,
      error: new Error('SyntaxError: Unexpected token'),
    };

    expect(toSSEEvent(event)).toEqual({
      type: 'bundle_build_failed',
      bundlerId: 'ios-true',
      error: 'SyntaxError: Unexpected token',
    });
  });

  it('should serialize Error to string for hmr_failed', () => {
    const event: IdentifiedReportableEvent = {
      type: 'hmr_failed',
      bundlerId,
      error: new Error('SyntaxError: Unexpected token'),
    };

    expect(toSSEEvent(event)).toEqual({
      type: 'hmr_failed',
      bundlerId: 'ios-true',
      error: 'SyntaxError: Unexpected token',
    });
  });

  it('should return null for transform events', () => {
    const event: IdentifiedReportableEvent = {
      type: 'transform',
      bundlerId,
      id: 'src/App.tsx',
      totalModules: 100,
      transformedModules: 50,
    };

    expect(toSSEEvent(event)).toBeNull();
  });

  it('should convert watch_change with bundlerId and rename fields', () => {
    const event: IdentifiedReportableEvent = { type: 'watch_change', bundlerId, id: 'src/App.tsx' };

    expect(toSSEEvent(event)).toEqual({
      type: 'watch_change',
      bundlerId: 'ios-true',
      file: 'src/App.tsx',
    });
  });

  it('should exclude client_log from build events and convert it for the client log stream', () => {
    const event: ReportableEvent = {
      type: 'client_log',
      level: 'error',
      data: ['Something went wrong'],
    };

    expect(toSSEEvent(event)).toBeNull();
    expect(toSSEClientLogEvent(event)).toEqual({
      type: 'client_log',
      data: ['Something went wrong'],
    });
  });

  it('should pass through non-reporter server events', () => {
    expect(toSSEEvent({ type: 'cache_reset' })).toEqual({ type: 'cache_reset' });
  });

  it('should convert HMR client lifecycle events', () => {
    const client = { id: 1 } as WebSocketClient;

    expect(toSSEEvent({ type: 'client_connected', client })).toEqual({
      type: 'client_connected',
      clientId: 1,
    });
    expect(toSSEEvent({ type: 'client_disconnected', client })).toEqual({
      type: 'client_disconnected',
      clientId: 1,
    });
  });
});
