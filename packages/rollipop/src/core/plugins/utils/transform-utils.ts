import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';

import type { PluginOption } from '../../../config';
import type { BundlerContext } from '../../types';
import type { Plugin } from '../types';

export const TRANSFORM_FLAGS_KEY = Symbol('transform-flags');
export const REVISION_KEY = Symbol('revision');

export type TransformMeta = rolldown.CustomPluginOptions & {
  [TRANSFORM_FLAGS_KEY]: TransformFlag;
  [REVISION_KEY]?: number;
};

type CurrentTransformMeta = TransformMeta & {
  [REVISION_KEY]: number;
};

export enum TransformFlag {
  NONE = 0b00000000,
  CODEGEN_REQUIRED = 0b00000001,
  STRIP_FLOW_REQUIRED = 0b00000010,
  SKIP_ALL = 0b10000000,
}

export function setFlag(
  this: rolldown.PluginContext,
  context: BundlerContext,
  id: string,
  flag: TransformFlag,
  options?: { override?: boolean },
): rolldown.CustomPluginOptions {
  const revision = context.state.revision;
  const moduleInfo = this.getModuleInfo(id);
  if (moduleInfo) {
    const meta = moduleInfo.meta as Partial<TransformMeta>;
    if (options?.override) {
      meta[TRANSFORM_FLAGS_KEY] = flag;
    } else if (isCurrentRevision(moduleInfo.meta, revision)) {
      moduleInfo.meta[TRANSFORM_FLAGS_KEY] |= flag;
    } else {
      meta[TRANSFORM_FLAGS_KEY] = flag;
    }
    meta[REVISION_KEY] = revision;
    return moduleInfo.meta;
  } else {
    return {
      [TRANSFORM_FLAGS_KEY]: flag,
      [REVISION_KEY]: revision,
    };
  }
}

export function hasFlag(meta: rolldown.CustomPluginOptions): meta is TransformMeta {
  return TRANSFORM_FLAGS_KEY in meta;
}

export function getFlag(
  this: rolldown.PluginContext,
  context: BundlerContext,
  id: string,
): TransformFlag {
  const moduleInfo = this.getModuleInfo(id);
  return getFlagFromModuleInfo(context, moduleInfo);
}

export function getFlagFromModuleInfo(
  context: BundlerContext,
  moduleInfo: rolldown.ModuleInfo | null,
): TransformFlag {
  if (moduleInfo && isCurrentRevision(moduleInfo.meta, context.state.revision)) {
    return moduleInfo.meta[TRANSFORM_FLAGS_KEY];
  }
  return TransformFlag.NONE;
}

function isCurrentRevision(
  meta: rolldown.CustomPluginOptions,
  revision: number,
): meta is CurrentTransformMeta {
  return hasFlag(meta) && meta[REVISION_KEY] === revision;
}

export interface TransformBoundaryPluginOptions {
  context: BundlerContext;
}

export function withTransformBoundary(
  context: BundlerContext,
  plugins: PluginOption,
): PluginOption {
  const initializerPlugin: Plugin = {
    name: 'rollipop:build-initializer',
    buildStart() {
      context.state.revision += 1;
      context.state.latestBuildStartTime = Date.now();
    },
  };

  // Skip JSON files from subsequent transforms.
  const skipJsonPlugin: Plugin = {
    name: 'rollipop:transform-skip-json',
    transform: {
      order: 'pre',
      filter: [include(id(/\.json$/))],
      handler(_code, id) {
        return { meta: setFlag.call(this, context, id, TransformFlag.SKIP_ALL) };
      },
    },
  };

  return [initializerPlugin, skipJsonPlugin, plugins];
}
