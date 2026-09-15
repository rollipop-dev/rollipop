import * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import { invariant } from 'es-toolkit';

import type { TransformConfig } from '../../config';
import { mergeBabelOptions } from '../../utils/babel';
import type { BundlerContext } from '../types';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface BabelPluginOptions {
  context: BundlerContext;
  transformConfig?: TransformConfig['babel'];
}

function babelPlugin({ context, transformConfig }: BabelPluginOptions): rolldown.Plugin[] {
  const { rules = [] } = transformConfig ?? {};
  const babelOptionsById: Map<string, babel.InputOptions[]> = new Map();

  const babelRules = rules.map(({ filter, options }, index) => {
    return {
      name: `rollipop:babel-rule-${index}`,
      transform: {
        filter,
        handler(code, id) {
          const existingBabelOptions = babelOptionsById.get(id);
          const resolvedOptions = typeof options === 'function' ? options(code, id) : options;
          void (existingBabelOptions
            ? existingBabelOptions.push(resolvedOptions)
            : babelOptionsById.set(id, [resolvedOptions]));
        },
      },
    } satisfies rolldown.Plugin;
  });

  const babelPlugin: rolldown.Plugin = {
    name: 'rollipop:babel',
    buildStart() {
      babelOptionsById.clear();
    },
    transform: {
      handler(code, id) {
        const flags = getFlag.call(this, context, id);
        if (flags & TransformFlag.SKIP_ALL) {
          return;
        }

        const babelOptions = babelOptionsById.get(id) ?? [];
        if (babelOptions.length === 0) {
          return;
        }

        const result = babel.transformSync(code, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          ...mergeBabelOptions(babelOptions),
        });
        invariant(result?.code, `Failed to transform with babel: ${id}`);

        const map = result.map && {
          ...result.map,
          names: [...result.map.names],
          sources: [...result.map.sources],
          sourcesContent: result.map.sourcesContent ? [...result.map.sourcesContent] : undefined,
        };
        return { code: result.code, map };
      },
    },
  };

  return [...babelRules, babelPlugin];
}

export { babelPlugin as babel };
