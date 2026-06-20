import { RollipopReactNativeTransformer } from '@rollipop/rolldown/experimental';

import type { ResolvedConfig } from '../config';

const transformers = new WeakMap<ResolvedConfig, RollipopReactNativeTransformer>();

export function transformWithRollipop(id: string, code: string, config: ResolvedConfig) {
  let transformer = transformers.get(config);

  if (transformer == null) {
    transformer = new RollipopReactNativeTransformer({
      envName: config.mode,
      runtimeTarget: config.runtimeTarget,
      flow: config.experimental.flow,
      worklets: config.experimental.worklets,
      swc: {
        externalHelpers: false,
      },
    });
    transformers.set(config, transformer);
  }

  const result = transformer.transformSync(id, code);

  return {
    code: result.code.trim(),
    map: result.map,
  };
}
