import { useEffect } from 'react';

import {
  subscribeDashboardSharedState,
  type DashboardEvent,
  type DashboardSharedState,
} from './api';

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

export function useDashboardEvents({
  onState,
  onBuildEvent,
  onDataEvent,
  onConnectionChange,
}: {
  onState?: (state: DashboardSharedState) => void;
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
    let lastSequence: number | undefined;

    void subscribeDashboardSharedState({
      onConnectionStatus(status) {
        if (status === 'connected') {
          onConnectionChange?.(true);
        } else if (status !== 'connecting') {
          onConnectionChange?.(false);
        }
      },
      onState(state) {
        if (disposed) return;

        onState?.(state);

        const event = state.lastEvent;
        if (lastSequence == null) {
          lastSequence = event?.sequence ?? 0;
          return;
        }
        if (event == null || event.sequence <= lastSequence) return;

        lastSequence = event.sequence;
        if (isEventType(event.data.type, BUILD_EVENT_TYPES)) {
          onBuildEvent?.(event.data);
        }
        if (isEventType(event.data.type, SNAPSHOT_EVENT_TYPES)) {
          onDataEvent?.(event.data);
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
        onConnectionChange?.(false);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [onBuildEvent, onConnectionChange, onDataEvent, onState]);
}

function isEventType(type: string, eventTypes: readonly string[]): boolean {
  return eventTypes.includes(type);
}
