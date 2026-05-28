import type * as rolldownExperimental from '@rollipop/rolldown/experimental';
import type * as ws from 'ws';

import type { MetroCompatibleClientLogEvent, ReportableEvent } from '../../types';
import type { WebSocketClient } from '../wss/server';

export type IdentifiedReportableEvent = ReportableEvent & {
  bundlerId: string;
};

export type BundlerEvent =
  | IdentifiedReportableEvent
  | {
      type: 'hmr_updates';
      bundlerId: string;
      updates: rolldownExperimental.BindingClientHmrUpdate[];
    };

export type ServerEvent =
  | BundlerEvent
  | MetroCompatibleClientLogEvent
  | {
      type: 'device_connected';
      client: WebSocketClient;
    }
  | {
      type: 'device_message';
      client: WebSocketClient;
      data: ws.RawData;
    }
  | {
      type: 'device_error';
      client: WebSocketClient;
      error: Error;
    }
  | {
      type: 'device_disconnected';
      client: WebSocketClient;
    }
  | {
      type: 'server_ready';
      host: string;
      port: number;
    }
  | {
      type: 'cache_reset';
    };

export function isBundlerEventForId(event: ServerEvent, bundlerId: string): event is BundlerEvent {
  return 'bundlerId' in event && event.bundlerId === bundlerId;
}
