import { useEffect } from 'react';

import { subscribeDashboardEvents, type DashboardEvent } from './api';

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
  'devices_changed',
  'watch_change',
  'hmr_failed',
] as const;

export function useDashboardEvents({
  onBuildEvent,
  onDataEvent,
  onConnectionChange,
}: {
  onBuildEvent?: (event: DashboardEvent) => void;
  onDataEvent?: (event: DashboardEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
} = {}) {
  useEffect(() => {
    if (__ROLLIPOP_MOCK__) {
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    void subscribeDashboardEvents({
      onConnectionStatus(status) {
        if (disposed) return;
        if (status === 'connected') {
          onConnectionChange?.(true);
        } else if (status !== 'connecting') {
          onConnectionChange?.(false);
        }
      },
      onEvent(event) {
        if (disposed) return;
        if (isEventType(event.type, BUILD_EVENT_TYPES)) {
          onBuildEvent?.(event);
        }
        if (isEventType(event.type, SNAPSHOT_EVENT_TYPES)) {
          onDataEvent?.(event);
        }
      },
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unsubscribe = dispose;
        }
      })
      .catch(() => {
        if (!disposed) onConnectionChange?.(false);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [onBuildEvent, onConnectionChange, onDataEvent]);
}

function isEventType(type: string, eventTypes: readonly string[]): boolean {
  return eventTypes.includes(type);
}
