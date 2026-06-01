import type * as rolldown from '@rollipop/rolldown';

import type { Config, ResolvedConfig } from '../../config';
import type { DevServer } from '../../server';
import type { AsyncResult } from '../types';
import type { PluginContext } from './context';

export type PluginConfig = Omit<Config, 'plugins'>;
export type ResolvedPluginConfig = Omit<ResolvedConfig, 'plugins'>;
type InternalRolldownHook = 'transformCacheHit';

export type Plugin = Omit<rolldown.Plugin, InternalRolldownHook> & {
  config?:
    | PluginConfig
    | ((this: PluginContext, config: PluginConfig) => AsyncResult<PluginConfig | null | void>);
  configResolved?: (this: PluginContext, config: ResolvedConfig) => AsyncResult<void>;
  configureServer?: (
    this: PluginContext,
    server: DevServer,
  ) => AsyncResult<void | (() => AsyncResult<void>)>;
};
