import { RollipopReactNativeTransformer } from '@rollipop/rolldown/experimental';

import type { ResolvedConfig } from '../config';
import { resolveWorkletsConfig } from './worklets';

const transformers = new WeakMap<ResolvedConfig, RollipopReactNativeTransformer>();

export function transformWithRollipop(id: string, code: string, config: ResolvedConfig) {
  let transformer = transformers.get(config);

  if (transformer == null) {
    transformer = new RollipopReactNativeTransformer({
      envName: config.mode,
      runtimeTarget: config.runtimeTarget,
      flow: config.transform.flow,
      worklets: resolveWorkletsConfig(config.experimental.worklets, config),
      swc: {
        externalHelpers: true,
        ...config.transform.swc?.native,
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
