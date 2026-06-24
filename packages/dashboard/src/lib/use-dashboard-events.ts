import { useEffect } from 'react';

import { getServerUrl } from './api';

const BUILD_EVENT_TYPES = [
  'bundle_build_started',
  'bundle_build_done',
  'bundle_build_failed',
] as const;

const SNAPSHOT_EVENT_TYPES = [
  'cache_reset',
  'server_ready',
  'client_connected',
  'client_disconnected',
] as const;

interface DashboardSSEEvent {
  type: string;
  bundlerId?: string;
}

export function useDashboardEvents({
  onBuildEvent,
  onDataEvent,
}: {
  onBuildEvent?: (event: DashboardSSEEvent) => void;
  onDataEvent?: (event: DashboardSSEEvent) => void;
} = {}) {
  useEffect(() => {
    if (__ROLLIPOP_MOCK__ || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(getServerUrl('/sse/events'));

    const handleBuildEvent = (message: MessageEvent<string>) => {
      const event = parseSSEEvent(message.data);
      if (event != null) onBuildEvent?.(event);
    };

    const handleDataEvent = (message: MessageEvent<string>) => {
      const event = parseSSEEvent(message.data);
      if (event != null) onDataEvent?.(event);
    };

    for (const type of BUILD_EVENT_TYPES) {
      source.addEventListener(type, handleBuildEvent);
    }

    for (const type of SNAPSHOT_EVENT_TYPES) {
      source.addEventListener(type, handleDataEvent);
    }

    return () => {
      for (const type of BUILD_EVENT_TYPES) {
        source.removeEventListener(type, handleBuildEvent);
      }

      for (const type of SNAPSHOT_EVENT_TYPES) {
        source.removeEventListener(type, handleDataEvent);
      }

      source.close();
    };
  }, [onBuildEvent, onDataEvent]);
}

function parseSSEEvent(data: string): DashboardSSEEvent | null {
  try {
    const event = JSON.parse(data) as DashboardSSEEvent;
    return typeof event.type === 'string' ? event : null;
  } catch {
    return null;
  }
}
