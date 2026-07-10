import type { OutputChunk } from '@rollipop/rolldown';

import type { ResolvedConfig } from './config/defaults';
import type { BuildOptions } from './core/types';
import type { DevServer, ServerOptions } from './server/types';

// Main APIs
export { loadConfig } from './config';
export { resetCache } from './utils/reset-cache';

export async function runBuild(
  config: ResolvedConfig,
  options: BuildOptions,
): Promise<OutputChunk> {
  const { runBuild } = await import('./utils/run-build');

  return runBuild(config, options);
}

export async function runServer(
  config: ResolvedConfig,
  options: ServerOptions,
): Promise<DevServer> {
  const { runServer } = await import('./utils/run-server');

  return runServer(config, options);
}

// Bundler
export { Bundler } from './core/bundler';
export type * from './core/types';

// Dev server
export * from './server';

// Plugins
export * as plugins from './core/plugins';
export type { Plugin, PluginConfig } from './core/plugins/types';

// Assets
export * as AssetUtils from './core/assets';

// Env
export * from './core/env';

// Config
export * from './config';

// Constants
export * as Constants from './constants';

// Types
export type * from './types';
export type * from './types/hmr';

// CLI
export * as cli from './node/cli';
export * from './node/cli-utils';

// Re-export `rolldown`
export * as rolldown from '@rollipop/rolldown';
export * as rolldownExperimental from '@rollipop/rolldown/experimental';
