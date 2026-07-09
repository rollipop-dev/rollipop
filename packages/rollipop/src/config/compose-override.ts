import { merge } from 'es-toolkit';

import type {
  RolldownOptions,
  RolldownOptionsConfig,
  RolldownOptionsContext,
} from '../core/rolldown';

export async function applyRolldownOptionsConfig(
  config: RolldownOptionsConfig,
  options: RolldownOptions,
  context: RolldownOptionsContext,
): Promise<RolldownOptions> {
  if (typeof config === 'function') {
    return await config(options, context);
  }

  return merge(options, config);
}

export function composeRolldownOptions(
  target: RolldownOptionsConfig | undefined,
  source: RolldownOptionsConfig | undefined,
): RolldownOptionsConfig | undefined {
  if (source == null) return target;
  if (target == null) return source;

  if (typeof target !== 'function' && typeof source !== 'function') {
    return merge(target, source);
  }

  return async (options: RolldownOptions, context: RolldownOptionsContext) => {
    const next = await applyRolldownOptionsConfig(target, options, context);
    return await applyRolldownOptionsConfig(source, next, context);
  };
}
