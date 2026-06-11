import { noop } from 'es-toolkit';

import * as Rollipop from '../../../index';
import { logger } from '../../logger';
import type { CommandAction } from '../../types';
import type { StartCommandOptions } from './index';

export const action: CommandAction<StartCommandOptions> = async function (options) {
  const cwd = process.cwd();
  const config = await Rollipop.loadConfig({
    cwd,
    mode: 'development',
    configFile: options.config,
    context: { command: 'start' },
  });

  if (options.resetCache) {
    Rollipop.resetCache(cwd);
    logger.info('The transform cache was reset');
  }

  if (options.clientLogs === false) {
    config.reporter = { update: noop };
  }

  const devServer = await Rollipop.runServer(config, {
    buildOptions: { cache: options.cache },
    port: options.port,
    host: options.host,
    https: options.https,
    key: options.key,
    cert: options.cert,
    mcp: options.mcp,
  });

  if (options.interactive) {
    Rollipop.setupInteractiveMode({ devServer, extraCommands: config.terminal?.extraCommands });
  }
};
