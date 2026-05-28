import stripAnsi from 'strip-ansi';

import type { IdentifiedReportableEvent, ServerEvent } from '../events/types';
import type { SSEEvent } from './types';

export function toSSEEvent(event: ServerEvent): SSEEvent | null {
  switch (event.type) {
    case 'client_log':
      return {
        type: 'client_log',
        ...(event.bundlerId != null ? { bundlerId: event.bundlerId } : {}),
        data: event.data,
      };

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
      return null;
  }
}

function reporterEventToSSEEvent(event: IdentifiedReportableEvent): SSEEvent | null {
  switch (event.type) {
    case 'bundle_build_started':
      return { type: 'bundle_build_started', bundlerId: event.bundlerId };

    case 'bundle_build_done':
      return {
        type: 'bundle_build_done',
        bundlerId: event.bundlerId,
        totalModules: event.totalModules,
        duration: event.duration,
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
      return { type: 'client_log', bundlerId: event.bundlerId, data: event.data };

    case 'transform':
      // Intentionally excluded from SSE — transform fires per module and would consume excessive LLM tokens.
      return null;
  }
}
