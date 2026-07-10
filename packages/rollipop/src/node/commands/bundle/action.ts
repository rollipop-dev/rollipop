import path from 'node:path';

import { loadConfig } from '../../../config';
import { resetCache } from '../../../utils/reset-cache';
import { logger } from '../../logger';
import type { CommandAction } from '../../types';
import type { BundleCommandArgs } from './index';

export const action: CommandAction<BundleCommandArgs> = async function (options) {
  if (!this.platforms.includes(options.platform)) {
    throw new Error(`Unrecognized platform: ${options.platform}`);
  }

  const cwd = process.cwd();
  const config = await loadConfig({
    cwd,
    mode: 'production',
    configFile: options.config,
    context: { command: 'bundle' },
  });

  if (options.resetCache) {
    await resetCache();
    logger.info('The transform cache was reset');
  }

  if (options.entryFile) {
    config.entry = path.resolve(cwd, options.entryFile);
  }

  const { runBuild } = await import('../../../utils/run-build');
  await runBuild(config, {
    platform: options.platform,
    dev: options.dev,
    minify: options.minify,
    cache: options.cache,
    ...(options.sourcemapOutput ? { sourcemap: true } : {}),
    outfile: options.bundleOutput,
    sourcemapOutfile: options.sourcemapOutput,
    assetsDir: options.assetsDest,
  });
};
