import stripAnsi from 'strip-ansi';

import type { IdentifiedReportableEvent, ServerEvent } from '../events/types';
import type { SSEBuildEvent, SSEClientLogEvent } from './types';

export function toSSEEvent(event: ServerEvent): SSEBuildEvent | null {
  switch (event.type) {
    case 'client_log':
      return null;

    case 'device_connected':
      return { type: 'device_connected', clientId: event.client.id };

    case 'device_disconnected':
      return { type: 'device_disconnected', clientId: event.client.id };

    case 'server_ready':
    case 'cache_reset':
      return event;

    case 'bundle_build_started':
    case 'bundle_build_done':
    case 'bundle_build_failed':
    case 'watch_change':
      return reporterEventToSSEEvent(event);

    case 'hmr_updates':
    case 'device_message':
    case 'device_error':
    case 'transform':
    case 'build_log':
    case 'build_error':
      return null;
  }
}

export function toSSEClientLogEvent(event: ServerEvent): SSEClientLogEvent | null {
  if (event.type !== 'client_log') {
    return null;
  }

  return {
    type: 'client_log',
    ...(event.bundlerId != null ? { bundlerId: event.bundlerId } : {}),
    data: event.data,
  };
}

function reporterEventToSSEEvent(event: IdentifiedReportableEvent): SSEBuildEvent | null {
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

    case 'watch_change':
      return { type: 'watch_change', bundlerId: event.bundlerId, file: event.id };

    case 'client_log':
    case 'transform':
    case 'build_log':
    case 'build_error':
      // Intentionally excluded from /sse/events. Client logs have their own SSE stream.
      return null;
  }
}
