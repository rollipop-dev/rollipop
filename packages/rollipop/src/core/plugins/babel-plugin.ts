import * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import { invariant } from 'es-toolkit';

import type { TransformerConfig } from '../../config';
import { mergeBabelOptions } from '../../utils/babel';
import type { BundlerContext } from '../types';
import { isJSX, isTS } from './utils';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface BabelPluginOptions {
  context: BundlerContext;
  /**
   * When `false`, the legacy JS preset (TS strip / Flow strip / RN
   * codegen) is applied. When `true`, the preset is skipped and only
   * user-provided rules run — the rust-side pipeline handles the rest.
   */
  useNativeTransformPipeline: boolean;
  transformConfig?: TransformerConfig['babel'];
}

function babelPlugin({
  context,
  useNativeTransformPipeline,
  transformConfig,
}: BabelPluginOptions): rolldown.Plugin[] {
  const { rules = [] } = transformConfig ?? {};
  const babelOptionsById: Map<string, babel.TransformOptions[]> = new Map();

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
        const shouldTransform = useNativeTransformPipeline
          ? babelOptions.length > 0
          : flags & TransformFlag.CODEGEN_REQUIRED || babelOptions.length > 0;
        if (!shouldTransform) {
          return;
        }

        const baseOptions = useNativeTransformPipeline ? [] : [getPreset(flags, id)];
        const result = babel.transformSync(code, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          ...mergeBabelOptions([...baseOptions, ...babelOptions]),
        });
        invariant(result?.code, `Failed to transform with babel: ${id}`);

        return { code: result.code, map: result.map };
      },
    },
  };

  return [...babelRules, babelPlugin];
}

function getPreset(flags: TransformFlag, id: string): babel.TransformOptions {
  const presets: babel.PluginItem[] = [];
  const plugins: babel.PluginItem[] = [];
  let parserOpts: babel.ParserOptions | null = null;

  if (flags & TransformFlag.STRIP_FLOW_REQUIRED) {
    parserOpts = { flow: 'all' } as any;
    plugins.push(
      [
        require.resolve('babel-plugin-syntax-hermes-parser'),
        {
          parseLangTypes: 'flow',
          reactRuntimeTarget: '19',
        },
      ],
      require.resolve('@babel/plugin-transform-flow-strip-types'),
    );
  } else if (isTS(id)) {
    plugins.push([
      require.resolve('@babel/plugin-transform-typescript'),
      {
        isTSX: isJSX(id),
        allowNamespaces: true,
      },
    ]);
  }

  if (flags & TransformFlag.CODEGEN_REQUIRED) {
    plugins.push([require.resolve('@react-native/babel-plugin-codegen')]);
  }

  const options: babel.TransformOptions = {
    presets,
    plugins,
  };

  if (parserOpts) {
    options.parserOpts = parserOpts;
  }

  return options;
}

export { babelPlugin as babel };
