import type { Emitter } from 'mitt';

import type { DevServerEvents } from '../server/types';
import type { Reporter } from '../types';
import type { EventListener } from './event-bus';

type ReactNativeReportEvent = (event: { type: string; [key: string]: unknown }) => void;

export function createReporterEventListener(reporter?: Reporter): EventListener {
  return (event) => reporter?.update(event);
}

export function createReactNativeEventListener(
  reportEvent?: ReactNativeReportEvent,
): EventListener {
  return (event) => {
    if (event.type === 'client_log') {
      reportEvent?.(event);
    }
  };
}

export function createDevServerEventListener(emitter: Emitter<DevServerEvents>): EventListener {
  return (event) => {
    switch (event.type) {
      case 'client_connected':
        emitter.emit('client.connected', { client: event.client });
        break;

      case 'client_message':
        emitter.emit('client.message', { client: event.client, data: event.data });
        break;

      case 'client_error':
        emitter.emit('client.error', { client: event.client, error: event.error });
        break;

      case 'client_disconnected':
        emitter.emit('client.disconnected', { client: event.client });
        break;
    }
  };
}
