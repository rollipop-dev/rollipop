import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';
import * as swc from '@swc/core';
import { partition } from 'es-toolkit';

import type { TransformConfig } from '../../config';
import { mergeSwcOptions } from '../../utils/swc';
import type { BundlerContext } from '../types';
import { ROLLDOWN_RUNTIME_EXCLUDE_FILTER, withRuntimeExclude } from './shared/filters';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface SwcPluginOptions {
  context: BundlerContext;
  transformConfig?: TransformConfig['swc'];
}

function swcPlugin({ context, transformConfig }: SwcPluginOptions): rolldown.Plugin[] {
  const { rules = [] } = transformConfig ?? {};
  const swcOptionsById: Map<string, swc.Options[]> = new Map();
  const [standaloneRules, mergedRules] = partition(
    [...rules.entries()],
    ([, rule]) => rule.standalone,
  );

  const swcHelpersResolvePlugin: rolldown.Plugin = {
    name: 'rollipop:swc-helpers-resolve',
    resolveId: {
      order: 'pre',
      filter: [include(id(/^@swc\/helpers/)), ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      handler(source, _importer, extraOptions) {
        return this.resolve(source, import.meta.dirname, extraOptions);
      },
    },
  };

  const standalonePlugins = standaloneRules.map(
    ([index, { filter, options }]) =>
      ({
        name: `rollipop:swc-standalone-rule-${index}`,
        transform: {
          filter: withRuntimeExclude(filter),
          handler(code, id) {
            if (getFlag.call(this, context, id) & TransformFlag.SKIP_ALL) {
              return;
            }

            return transform(code, id, typeof options === 'function' ? options(code, id) : options);
          },
        },
      }) satisfies rolldown.Plugin,
  );

  const swcRules = mergedRules.map(([index, { filter, options }]) => {
    return {
      name: `rollipop:swc-rule-${index}`,
      transform: {
        filter: withRuntimeExclude(filter),
        handler(code, id) {
          const existingSwcOptions = swcOptionsById.get(id);
          const resolvedOptions = typeof options === 'function' ? options(code, id) : options;
          void (existingSwcOptions
            ? existingSwcOptions.push(resolvedOptions)
            : swcOptionsById.set(id, [resolvedOptions]));
        },
      },
    } satisfies rolldown.Plugin;
  });

  const swcPlugin: rolldown.Plugin = {
    name: 'rollipop:swc',
    buildStart() {
      swcOptionsById.clear();
    },
    transform: {
      filter: [ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      handler(code, id) {
        if (getFlag.call(this, context, id) & TransformFlag.SKIP_ALL) {
          return;
        }

        const swcOptions = swcOptionsById.get(id) ?? [];
        if (swcOptions.length === 0) {
          return;
        }

        return transform(code, id, mergeSwcOptions(swcOptions));
      },
    },
  };

  return [
    swcHelpersResolvePlugin,
    ...standalonePlugins,
    ...(swcRules.length > 0 ? [...swcRules, swcPlugin] : []),
  ];
}

function transform(code: string, id: string, options: swc.Options) {
  const result = swc.transformSync(code, {
    filename: id,
    configFile: false,
    swcrc: false,
    sourceMaps: true,
    // Disables the input source map to prevent error logs when
    // swc cannot find the source map file (e.g., in Yarn PnP environments).
    inputSourceMap: false,
    ...options,
  });

  return { code: result.code, map: result.map };
}

export { swcPlugin as swc };
