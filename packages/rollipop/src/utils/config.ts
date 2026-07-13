import fs from 'node:fs';

import type { ResolvedConfig } from '../config';
import type { ReportableEvent, Reporter } from '../types';

export function bindReporter(
  config: ResolvedConfig,
  onEvent?: (event: ReportableEvent) => void,
): ResolvedConfig {
  const reporter: Reporter = {
    update(event) {
      onEvent?.(event);
    },
  };

  return { ...config, reporter };
}

export interface ResolvedHmrConfig {
  runtimeImplement: string;
  clientImplement: string;
}

export function resolveHmrConfig(config: ResolvedConfig): ResolvedHmrConfig | null {
  if (config.mode !== 'development') {
    return null;
  }

  const defaultRuntimeImplements = getDefaultRuntimeImplements();

  if (typeof config.dev.hmr === 'boolean') {
    return config.dev.hmr ? defaultRuntimeImplements : null;
  }

  const {
    runtimeImplement = defaultRuntimeImplements.runtimeImplement,
    clientImplement = defaultRuntimeImplements.clientImplement,
  } = config.dev.hmr;

  return { runtimeImplement, clientImplement };
}

getDefaultRuntimeImplements.cache = null as ResolvedHmrConfig | null;
export function getDefaultRuntimeImplements(): ResolvedHmrConfig {
  if (getDefaultRuntimeImplements.cache == null) {
    getDefaultRuntimeImplements.cache = {
      runtimeImplement: fs.readFileSync(require.resolve('rollipop/hmr-runtime'), 'utf-8'),
      clientImplement: fs.readFileSync(require.resolve('rollipop/hmr-client'), 'utf-8'),
    };
  }
  return getDefaultRuntimeImplements.cache;
}
