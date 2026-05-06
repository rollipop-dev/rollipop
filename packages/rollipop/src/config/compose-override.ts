import { merge } from 'es-toolkit';

import type { Config, RolldownConfig } from './types';

type OverrideOption = NonNullable<Config['dangerously_overrideRolldownOptions']>;

export async function applyOverrideRolldownOptions(
  override: OverrideOption,
  rolldownOptions: RolldownConfig,
): Promise<RolldownConfig> {
  if (typeof override === 'function') {
    return await override(rolldownOptions);
  }

  return {
    input: merge(rolldownOptions.input ?? {}, override.input ?? {}),
    output: merge(rolldownOptions.output ?? {}, override.output ?? {}),
  };
}

export function composeOverrideRolldownOptions(
  target: OverrideOption | undefined,
  source: OverrideOption | undefined,
): OverrideOption | undefined {
  if (source == null) return target;
  if (target == null) return source;
  return async (rolldownOptions: RolldownConfig) => {
    const next = await applyOverrideRolldownOptions(target, rolldownOptions);
    return await applyOverrideRolldownOptions(source, next);
  };
}
