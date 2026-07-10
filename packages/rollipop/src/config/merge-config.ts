import { isNotNil, mergeWith } from 'es-toolkit';

import { Plugin } from '../core/plugins/types';
import type { Reporter } from '../types';
import { mergeReporters } from '../utils/reporters';
import { composeRolldownOptions } from './compose-override';
import type { DefaultConfig, ResolvedConfig } from './defaults';
import type { Config } from './types';

export type PluginFlattenConfig = Omit<Config, 'plugins'> & { plugins?: Plugin[] };

export function mergeConfig(
  baseConfig: PluginFlattenConfig,
  ...overrideConfigs: PluginFlattenConfig[]
): Config;
export function mergeConfig(
  baseConfig: DefaultConfig,
  ...overrideConfigs: PluginFlattenConfig[]
): ResolvedConfig;
export function mergeConfig(
  baseConfig: PluginFlattenConfig | DefaultConfig,
  ...overrideConfigs: PluginFlattenConfig[]
): Config | ResolvedConfig {
  let mergedConfig = baseConfig;

  for (const overrideConfig of overrideConfigs) {
    mergedConfig = mergeWith(mergedConfig, overrideConfig, (target, source, key) => {
      if (
        ['sourceExtensions', 'assetExtensions', 'prelude', 'polyfills', 'plugins'].includes(key)
      ) {
        return Array.from(new Set([...(target ?? []), ...(source ?? [])]));
      }

      if (key === 'reporter') {
        if (target === source) {
          return target;
        }

        const reporters = [target, source].filter(isNotNil) as Reporter[];
        return reporters.length > 0 ? mergeReporters(reporters) : undefined;
      }

      if (key === 'rolldownOptions') {
        return composeRolldownOptions(target, source);
      }
    });
  }

  return mergedConfig;
}
