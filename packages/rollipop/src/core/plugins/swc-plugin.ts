import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';
import * as swc from '@swc/core';

import type { TransformConfig } from '../../config';
import { mergeSwcOptions } from '../../utils/swc';
import type { BundlerContext } from '../types';
import { ROLLDOWN_RUNTIME_EXCLUDE_FILTER } from './shared/filters';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface SwcPluginOptions {
  context: BundlerContext;
  transformConfig?: TransformConfig['swc'];
}

function swcPlugin({ context, transformConfig }: SwcPluginOptions): rolldown.Plugin[] {
  const { rules = [] } = transformConfig ?? {};
  const swcOptionsById: Map<string, swc.Options[]> = new Map();

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

  const swcRules = rules.map(({ filter, options }, index) => {
    return {
      name: `rollipop:swc-rule-${index}`,
      transform: {
        filter,
        handler(code, id) {
          const existingBabelOptions = swcOptionsById.get(id);
          const resolvedOptions = typeof options === 'function' ? options(code, id) : options;
          void (existingBabelOptions
            ? existingBabelOptions.push(resolvedOptions)
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

        const result = swc.transformSync(code, {
          filename: id,
          configFile: false,
          swcrc: false,
          sourceMaps: true,
          // Disables the input source map to prevent error logs when
          // swc cannot find the source map file (e.g., in Yarn PnP environments).
          inputSourceMap: false,
          ...mergeSwcOptions(swcOptions),
        });

        return { code: result.code, map: result.map };
      },
    },
  };

  return [swcHelpersResolvePlugin, ...(swcRules.length > 0 ? [...swcRules, swcPlugin] : [])];
}

export { swcPlugin as swc };
