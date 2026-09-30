import type { ResolvedConfig } from '../config';
import {
  createDevServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  type DevServer,
  type ServerOptions,
} from '../server';

export async function runServer(
  config: ResolvedConfig,
  options: ServerOptions,
): Promise<DevServer> {
  const { port = DEFAULT_PORT, host = DEFAULT_HOST } = options;
  const devServer = await createDevServer(config, options);

  await devServer.instance.listen({ port, host });

  return devServer;
}
