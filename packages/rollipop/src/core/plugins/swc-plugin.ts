import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';
import * as swc from '@swc/core';

import type { ResolvedConfig, TransformerConfig } from '../../config';
import { mergeSwcOptions } from '../../utils/swc';
import type { BundlerContext } from '../types';
import { ROLLDOWN_RUNTIME_EXCLUDE_FILTER } from './shared/filters';
import { getFlag, TransformFlag } from './utils/transform-utils';

export interface SwcPluginOptions {
  context: BundlerContext;
  /**
   * When `false`, the legacy JS preset for the resolved `runtimeTarget`
   * is applied to every module (TS/JSX strip, hermes target). When
   * `true`, the preset is skipped and only user-provided rules run — the
   * rust-side pipeline handles the rest.
   */
  useNativeTransformPipeline: boolean;
  runtimeTarget: ResolvedConfig['runtimeTarget'];
  transformConfig?: TransformerConfig['swc'];
}

function swcPlugin({
  context,
  useNativeTransformPipeline,
  runtimeTarget,
  transformConfig,
}: SwcPluginOptions): rolldown.Plugin[] {
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

  const getSwcPreset = useNativeTransformPipeline ? null : presets[runtimeTarget];
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
        if (getSwcPreset == null && swcOptions.length === 0) {
          return;
        }

        const baseOptions = getSwcPreset != null ? [getSwcPreset(id)] : [];
        const result = swc.transformSync(code, {
          filename: id,
          configFile: false,
          swcrc: false,
          sourceMaps: true,
          // Disables the input source map to prevent error logs when
          // swc cannot find the source map file (e.g., in Yarn PnP environments).
          inputSourceMap: false,
          ...mergeSwcOptions([...baseOptions, ...swcOptions]),
        });

        return { code: result.code, map: result.map };
      },
    },
  };

  return [swcHelpersResolvePlugin, ...swcRules, swcPlugin];
}

const presets = {
  'hermes-v1': (id: string): swc.Options => ({
    env: {
      targets: { node: 9999 },
      // See:
      // - Hermes's supported features: https://github.com/facebook/hermes/blob/main/doc/Features.md
      // - Swc's transform preset: https://github.com/swc-project/swc/blob/v1.15.18/crates/swc_ecma_preset_env/src/transform_data.rs
      include: [
        'transform-block-scoping',
        // `assumptions.setPublicClassFields`
        'transform-class-properties',
        // `assumptions.privateFieldsAsProperties`
        'transform-private-methods',
        'transform-private-property-in-object',
      ],
    },
    jsc: {
      parser: {
        // Parse as TypeScript code because Flow modules can be `.js` files with type annotations
        syntax: 'typescript',
        // Always enable JSX parsing because Flow modules can be `.js` files with JSX syntax
        tsx: true,
      },
      transform: {
        react: {
          runtime: 'preserve',
        },
      },
      externalHelpers: true,
    },
    isModule: id.endsWith('.cjs') ? 'commonjs' : true,
  }),
  hermes: (id: string): swc.Options => ({
    jsc: {
      parser: {
        // Parse as TypeScript code because Flow modules can be `.js` files with type annotations
        syntax: 'typescript',
        // Always enable JSX parsing because Flow modules can be `.js` files with JSX syntax
        tsx: true,
      },
      transform: {
        react: {
          runtime: 'preserve',
        },
      },
      externalHelpers: true,
      keepClassNames: true,
      loose: false,
      assumptions: {
        setPublicClassFields: true,
        privateFieldsAsProperties: true,
      },
      target: 'es5',
    },
    isModule: id.endsWith('.cjs') ? 'commonjs' : true,
  }),
};

export { swcPlugin as swc };
