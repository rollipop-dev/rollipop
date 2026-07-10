import type * as rolldownExperimental from '@rollipop/rolldown/experimental';
import type * as ws from 'ws';

import type { WebSocketClient } from '../server/wss/server';

interface OptionalBundlerId {
  bundlerId?: string;
}

export interface BuildDiagnosticLog {
  code?: string;
  plugin?: string;
  message: string;
  stack?: string;
  id?: string;
  hook?: string;
  frame?: string;
  loc?: {
    column: number;
    file?: string;
    line: number;
  };
  meta?: unknown;
}

type InternalEvent = (
  | {
      type: 'bundle_build_started';
    }
  | {
      type: 'bundle_build_done';
      totalModules: number;
      transformedModules: number;
      cacheHitModules: number;
      duration: number;
      bundleFilePath?: string;
    }
  | {
      type: 'bundle_build_failed';
      error: Error;
    }
  | {
      type: 'hmr_failed';
      error: Error;
    }
  | {
      type: 'transform';
      id: string;
      totalModules: number | undefined;
      transformedModules: number;
    }
  | {
      type: 'watch_change';
      id: string;
    }
  | {
      type: 'build_log';
      level: 'debug' | 'info';
      log: BuildDiagnosticLog;
    }
  | {
      type: 'build_error';
      level: 'warn' | 'error';
      log: BuildDiagnosticLog;
    }
  | {
      type: 'hmr_updates';
      bundlerId: string;
      updates: rolldownExperimental.BindingClientHmrUpdate[];
      changedFiles: string[];
    }
  | {
      type: 'client_connected';
      client: WebSocketClient;
    }
  | {
      type: 'client_message';
      client: WebSocketClient;
      data: ws.RawData;
    }
  | {
      type: 'client_error';
      client: WebSocketClient;
      error: Error;
    }
  | {
      type: 'client_disconnected';
      client: WebSocketClient;
    }
  | {
      type: 'server_ready';
      host: string;
      port: number;
    }
  | {
      type: 'cache_reset';
    }
) &
  OptionalBundlerId;

type MetroCompatibleEvent = {
  type: 'client_log';
  level:
    | 'trace'
    | 'info'
    | 'warn'
    | 'log'
    | 'group'
    | 'groupCollapsed'
    | 'groupEnd'
    | 'debug'
    /**
     * React Native's reportable event level does not include `error`, but Flipper supports it.
     *
     * @see https://github.com/facebook/flipper/blob/v0.273.0/desktop/flipper-common/src/server-types.tsx#L74
     */
    | 'error';
  data: any[];
  bundlerId?: string;
};

export type ReportableEvent = InternalEvent | MetroCompatibleEvent;
