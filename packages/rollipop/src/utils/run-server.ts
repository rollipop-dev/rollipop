import type { ResolvedConfig } from '../config';
import {
  createDevServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  type DevServer,
  type ServerOptions,
} from '../server';
import { logger } from '../server/logger';

export async function runServer(
  config: ResolvedConfig,
  options: ServerOptions,
): Promise<DevServer> {
  const { port = DEFAULT_PORT, host = DEFAULT_HOST, https = false } = options;
  const devServer = await createDevServer(config, options);

  await devServer.instance.listen({ port, host });

  if (options.mcp === true) {
    const protocol = https ? 'https' : 'http';
    logger.info(`MCP server listening at ${protocol}://${host}:${port}/mcp`);
  }

  return devServer;
}
