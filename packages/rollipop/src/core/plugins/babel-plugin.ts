import * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import { invariant, partition } from 'es-toolkit';

import type { TransformConfig } from '../../config';
import { mergeBabelOptions } from '../../utils/babel';
import type { BundlerContext } from '../types';
import { ROLLDOWN_RUNTIME_EXCLUDE_FILTER, withRuntimeExclude } from './shared/filters';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface BabelPluginOptions {
  context: BundlerContext;
  transformConfig?: TransformConfig['babel'];
}

function babelPlugin({ context, transformConfig }: BabelPluginOptions): rolldown.Plugin[] {
  const { rules = [] } = transformConfig ?? {};
  const babelOptionsById: Map<string, babel.InputOptions[]> = new Map();
  const [standaloneRules, mergedRules] = partition(
    [...rules.entries()],
    ([, rule]) => rule.standalone,
  );

  const standalonePlugins = standaloneRules.map(
    ([index, { filter, options }]) =>
      ({
        name: `rollipop:babel-standalone-rule-${index}`,
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

  const babelRules = mergedRules.map(([index, { filter, options }]) => {
    return {
      name: `rollipop:babel-rule-${index}`,
      transform: {
        filter: withRuntimeExclude(filter),
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
      filter: [ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      handler(code, id) {
        const flags = getFlag.call(this, context, id);
        if (flags & TransformFlag.SKIP_ALL) {
          return;
        }

        const babelOptions = babelOptionsById.get(id) ?? [];
        if (babelOptions.length === 0) {
          return;
        }

        return transform(code, id, mergeBabelOptions(babelOptions));
      },
    },
  };

  return [...standalonePlugins, ...(babelRules.length > 0 ? [...babelRules, babelPlugin] : [])];
}

function transform(code: string, id: string, options: babel.InputOptions) {
  const result = babel.transformSync(code, {
    filename: id,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    ...options,
  });
  invariant(result?.code, `Failed to transform with babel: ${id}`);

  const map = result.map && {
    ...result.map,
    names: [...result.map.names],
    sources: [...result.map.sources],
    sourcesContent: result.map.sourcesContent ? [...result.map.sourcesContent] : undefined,
  };

  return { code: result.code, map };
}

export { babelPlugin as babel };
