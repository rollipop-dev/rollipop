import { noop } from 'es-toolkit';

import { loadConfig } from '../../../config';
import { resetCache } from '../../../utils/reset-cache';
import { logger } from '../../logger';
import type { CommandAction } from '../../types';
import type { StartCommandOptions } from './index';
import { setupInteractiveMode } from './setup-interactive-mode';

export const action: CommandAction<StartCommandOptions> = async function (options) {
  const cwd = process.cwd();
  const config = await loadConfig({
    cwd,
    mode: 'development',
    configFile: options.config,
    context: { command: 'start' },
  });

  if (options.resetCache) {
    await resetCache();
    logger.info('The transform cache was reset');
  }

  if (options.clientLogs === false) {
    config.reporter = { update: noop };
  }

  const { runServer } = await import('../../../utils/run-server');
  const devServer = await runServer(config, {
    buildOptions: { cache: options.cache },
    port: options.port,
    host: options.host,
    https: options.https,
    key: options.key,
    cert: options.cert,
    mcp: options.mcp,
  });

  if (options.interactive) {
    setupInteractiveMode({ devServer, extraCommands: config.terminal?.extraCommands });
  }
};
