import { logger } from '../logger';
import type { ResolvedConfig } from './defaults';

export function printConfigNotice(config: ResolvedConfig) {
  if (typeof config.transform.jsx === 'object' && config.transform.jsx.compiler != null) {
    logger.info('✨ React Compiler is enabled');
  }
}
