import stripAnsi from 'strip-ansi';

import type { ReportableEvent } from '../../types';

export type DevframeEvent =
  | { type: 'bundle_build_started'; bundlerId: string }
  | {
      type: 'bundle_build_done';
      bundlerId: string;
      totalModules: number;
      transformedModules: number;
      cacheHitModules: number;
      duration: number;
      bundleFilePath?: string;
    }
  | { type: 'bundle_build_failed'; bundlerId: string; error: string }
  | { type: 'hmr_failed'; bundlerId: string; error: string }
  | { type: 'watch_change'; bundlerId: string; file: string }
  | { type: 'client_connected'; clientId: number }
  | { type: 'client_disconnected'; clientId: number }
  | { type: 'server_ready'; host: string; port: number }
  | { type: 'cache_reset' };

type DevframeBundlerEvent = Extract<
  ReportableEvent,
  {
    type:
      | 'bundle_build_started'
      | 'bundle_build_done'
      | 'bundle_build_failed'
      | 'hmr_failed'
      | 'watch_change';
  }
>;

export function toDevframeEvent(event: ReportableEvent): DevframeEvent | null {
  switch (event.type) {
    case 'client_log':
      return null;

    case 'client_connected':
      return { type: 'client_connected', clientId: event.client.id };

    case 'client_disconnected':
      return { type: 'client_disconnected', clientId: event.client.id };

    case 'server_ready':
    case 'cache_reset':
      return event;

    case 'bundle_build_started':
    case 'bundle_build_done':
    case 'bundle_build_failed':
    case 'hmr_failed':
    case 'watch_change':
      return bundlerEventToDevframeEvent(event);

    case 'hmr_updates':
    case 'client_message':
    case 'client_error':
    case 'transform':
    case 'build_log':
    case 'build_error':
      return null;
  }
}

function bundlerEventToDevframeEvent(event: DevframeBundlerEvent): DevframeEvent | null {
  if (event.bundlerId == null) {
    return null;
  }

  switch (event.type) {
    case 'bundle_build_started':
      return { type: 'bundle_build_started', bundlerId: event.bundlerId };

    case 'bundle_build_done':
      return {
        type: 'bundle_build_done',
        bundlerId: event.bundlerId,
        totalModules: event.totalModules,
        transformedModules: event.transformedModules,
        cacheHitModules: event.cacheHitModules,
        duration: event.duration,
        ...(event.bundleFilePath != null ? { bundleFilePath: event.bundleFilePath } : {}),
      };

    case 'bundle_build_failed':
      return {
        type: 'bundle_build_failed',
        bundlerId: event.bundlerId,
        error: stripAnsi(event.error.message),
      };

    case 'hmr_failed':
      return {
        type: 'hmr_failed',
        bundlerId: event.bundlerId,
        error: stripAnsi(event.error.message),
      };

    case 'watch_change':
      return { type: 'watch_change', bundlerId: event.bundlerId, file: event.id };
  }
}
