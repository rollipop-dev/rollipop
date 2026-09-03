import type { DevframeCapabilities, DevframeHubContext } from '@devframes/hub/types';
import type * as rolldown from '@rollipop/rolldown';

import type { Config, ResolvedConfig } from '../../config';
import type { DevServer } from '../../server';
import type { AsyncResult } from '../types';
import type { PluginContext } from './context';

export type PluginConfig = Omit<Config, 'plugins'>;
export type ResolvedPluginConfig = Omit<ResolvedConfig, 'plugins'>;
type InternalRolldownHook = 'transformCacheHit';

export interface DevToolsPluginOptions {
  capabilities?: {
    dev?: DevframeCapabilities | boolean;
    build?: DevframeCapabilities | boolean;
  };
  setup: (context: RollipopDevToolsNodeContext) => AsyncResult<void>;
}

export interface RollipopDevToolsNodeContext extends DevframeHubContext {
  readonly rollipopConfig: ResolvedConfig;
  readonly rollipopServer?: DevServer;
}

export type Plugin = Omit<rolldown.Plugin, InternalRolldownHook> & {
  config?:
    | PluginConfig
    | ((this: PluginContext, config: PluginConfig) => AsyncResult<PluginConfig | null | void>);
  configResolved?: (this: PluginContext, config: ResolvedConfig) => AsyncResult<void>;
  configureServer?: (
    this: PluginContext,
    server: DevServer,
  ) => AsyncResult<void | (() => AsyncResult<void>)>;
  devtools?: DevToolsPluginOptions;
};
