import { logger } from '../logger';
import type { ResolvedConfig } from './defaults';

export function printConfigNotice(config: ResolvedConfig) {
  if (config.transformer.reactCompiler != null) {
    logger.info('✨ React Compiler is enabled');
  }
}
