import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';

import type { PluginOption } from '../../../config';
import type { BundlerContext } from '../../types';
import type { Plugin } from '../types';

export const TRANSFORM_FLAGS_KEY = Symbol('transform-flags');

export type TransformMeta = rolldown.CustomPluginOptions & {
  [TRANSFORM_FLAGS_KEY]: TransformFlag;
};

export enum TransformFlag {
  NONE = 0b00000000,
  CODEGEN_REQUIRED = 0b00000001,
  STRIP_FLOW_REQUIRED = 0b00000010,
  SKIP_ALL = 0b10000000,
}

export function setFlag(
  context: rolldown.PluginContext,
  id: string,
  flag: TransformFlag,
  options?: { override?: boolean },
): rolldown.CustomPluginOptions {
  const moduleInfo = context.getModuleInfo(id);
  if (moduleInfo && hasFlag(moduleInfo.meta)) {
    if (options?.override) {
      moduleInfo.meta[TRANSFORM_FLAGS_KEY] = flag;
    } else {
      moduleInfo.meta[TRANSFORM_FLAGS_KEY] |= flag;
    }
    return moduleInfo.meta;
  } else {
    return { [TRANSFORM_FLAGS_KEY]: flag };
  }
}

export function hasFlag(meta: rolldown.CustomPluginOptions): meta is TransformMeta {
  return TRANSFORM_FLAGS_KEY in meta;
}

export function getFlag(context: rolldown.PluginContext, id: string): TransformFlag {
  const moduleInfo = context.getModuleInfo(id);
  return getFlagFromModuleInfo(moduleInfo);
}

export function getFlagFromModuleInfo(moduleInfo: rolldown.ModuleInfo | null): TransformFlag {
  if (moduleInfo && hasFlag(moduleInfo.meta)) {
    return moduleInfo.meta[TRANSFORM_FLAGS_KEY];
  }
  return TransformFlag.NONE;
}

export interface TransformBoundaryPluginOptions {
  context: BundlerContext;
}

export function withTransformBoundary(
  context: BundlerContext,
  plugins: PluginOption,
): PluginOption {
  const initializer: Plugin = {
    name: 'rollipop:transform-initializer',
    transform: {
      order: 'pre',
      handler(_code, id) {
        if (context.state.hmrUpdates.has(id)) {
          context.state.hmrUpdates.delete(id);
          return { meta: setFlag(this, id, TransformFlag.NONE, { override: true }) };
        }
      },
    },
  };

  const fileWatcherPlugin: Plugin = {
    name: 'rollipop:transform-file-watcher',
    watchChange(id) {
      context.state.hmrUpdates.add(id);
    },
  };

  // Skip JSON files from subsequent transforms.
  const skipJsonPlugin: Plugin = {
    name: 'rollipop:transform-skip-json',
    transform: {
      order: 'pre',
      filter: [include(id(/\.json$/))],
      handler(_code, id) {
        return { meta: setFlag(this, id, TransformFlag.SKIP_ALL) };
      },
    },
  };

  return [initializer, fileWatcherPlugin, skipJsonPlugin, plugins];
}
