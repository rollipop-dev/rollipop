import type { ResolvedConfig } from '../config/defaults';
import type { DevServer, ServerOptions } from './types';

export async function createDevServer(
  config: ResolvedConfig,
  options?: ServerOptions,
): Promise<DevServer> {
  const { createDevServer } = await import('./create-dev-server');

  return createDevServer(config, options);
}

export * from './constants';

export type * from './types';
