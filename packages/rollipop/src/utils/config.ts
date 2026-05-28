import fs from 'node:fs';

import type { HmrConfig, ResolvedConfig } from '../config';
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

export type ResolvedHmrConfig = Required<HmrConfig>;

export function resolveHmrConfig(config: ResolvedConfig): ResolvedHmrConfig | null {
  if (config.mode !== 'development') {
    return null;
  }

  const defaultRuntimeImplements = getDefaultRuntimeImplements();

  if (typeof config.devMode.hmr === 'boolean') {
    return config.devMode.hmr ? defaultRuntimeImplements : null;
  }

  const {
    runtimeImplement = defaultRuntimeImplements.runtimeImplement,
    clientImplement = defaultRuntimeImplements.clientImplement,
  } = config.devMode.hmr;

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
