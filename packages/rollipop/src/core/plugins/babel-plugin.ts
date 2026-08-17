import * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import { invariant } from 'es-toolkit';

import { stripFlowTypes } from '../../common/transformer';
import type { TransformConfig } from '../../config';
import { mergeBabelOptions } from '../../utils/babel';
import { resolveFrom } from '../../utils/node-resolve';
import type { BundlerContext } from '../types';
import { isJSX, isTS } from './utils';
import { getFlag, TransformFlag } from './utils/transform-utils';

/**
 * Reanimated v3/v4 requires its Babel plugin to run during transform so it can
 * transform `worklet` directives (and, on some RN versions, patch
 * `ScrollView.scrollTo`). `babel-preset-expo` auto-injects it whenever
 * `react-native-reanimated` is installed; Rollipop's pipeline deliberately
 * ignores project Babel config (see `babelrc: false` below), so we inject it
 * explicitly. Detected lazily per-project and cached; absent when the dep isn't
 * installed.
 */
let cachedReanimatedPlugin: string | null | undefined;
function resolveReanimatedPlugin(root: string): string | null {
  if (cachedReanimatedPlugin === undefined) {
    try {
      cachedReanimatedPlugin = resolveFrom(root, 'react-native-reanimated/plugin');
    } catch {
      cachedReanimatedPlugin = null;
    }
  }
  return cachedReanimatedPlugin;
}

export interface BabelPluginOptions {
  context: BundlerContext;
  /**
   * When `false`, the legacy JS preset (TS strip / Flow strip / RN
   * codegen) is applied. When `true`, the preset is skipped and only
   * user-provided rules run — the rust-side pipeline handles the rest.
   */
  useNativeTransformPipeline: boolean;
  transformConfig?: TransformConfig['babel'];
}

function babelPlugin({
  context,
  useNativeTransformPipeline,
  transformConfig,
}: BabelPluginOptions): rolldown.Plugin[] {
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
      async handler(code, id) {
        const flags = getFlag.call(this, context, id);
        if (flags & TransformFlag.SKIP_ALL) {
          return;
        }

        const babelOptions = babelOptionsById.get(id) ?? [];
        const reanimatedPlugin = resolveReanimatedPlugin(context.root);
        const isScript = /\.(m?[jt]sx?|c?[jt]sx?)$/.test(id);
        const needsReanimated = reanimatedPlugin != null && isScript;

        const baseOptions = useNativeTransformPipeline
          ? []
          : [getPreset(flags, id, code, context.buildType === 'serve')];
        // In the legacy (non-native-pipeline) mode, Babel must parse every
        // native script (`.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs`): React Native
        // and Expo ship raw JSX inside `.js`/`.mjs` and Flow inside `.js`, and
        // app code is frequently `.tsx`. `getPreset` only attaches the plugins
        // each file actually needs (TS strip, Flow strip, codegen), so running
        // it on a plain module is a cheap no-op. Gating on `needsReanimated`
        // alone would skip `.tsx`/`.js` files when the project has no
        // reanimated, leaving oxc to mis-parse them (oxc's `moduleTypes` does
        // not rewrite `.tsx` parsing in the dev server here) — so we force the
        // transform for every script in legacy mode.
        const shouldTransform = useNativeTransformPipeline
          ? babelOptions.length > 0 || needsReanimated
          : isScript ||
            flags & TransformFlag.CODEGEN_REQUIRED ||
            babelOptions.length > 0 ||
            needsReanimated;
        if (!shouldTransform) {
          return;
        }

        // Virtual modules (e.g. `\0rolldown/runtime.js`) are emitted by the
        // bundler itself and must never be parsed by Babel.
        if (id.includes('\0')) {
          return;
        }

        const extraPlugins: babel.PluginItem[] = needsReanimated
          ? [reanimatedPlugin as babel.PluginItem]
          : [];

        // React Native / Expo ship Flow source inside plain `.js`/`.mjs`/`.cjs`
        // modules and raw JSX inside `.js`/`.mjs`/`.jsx`/`.tsx`. Because rolldown
        // does not guarantee that the `rollipop:react-native-strip-flow-syntax`
        // pre-pass is chained into this transform — and when it is, the stripped
        // output has already lost its `@flow` marker — we make Babel
        // self-sufficient: we strip Flow ourselves on every plain-JS script
        // (idempotent — already-stripped or non-Flow source passes through
        // `stripFlowTypes` untouched) and always parse scripts with both the
        // `typescript` and `jsx` parser plugins. `.ts`/`.tsx` files are handled
        // by `getPreset` (the `@babel/plugin-transform-typescript` transform),
        // so we don't run the Flow stripper on them. oxc finishes the JSX → JS
        // transform via `moduleTypes`.
        const isPlainJs = /\.(m?js|c?js|m?jsx|c?jsx)$/.test(id);
        let inputCode = code;
        if (isPlainJs) {
          try {
            inputCode = (await stripFlowTypes(id, code)).code;
          } catch {
            inputCode = code;
          }
        }

        const mergedOptions = mergeBabelOptions([...baseOptions, ...babelOptions]);

        // Always parse scripts with the `typescript` + `jsx` + `importMeta`
        // parser plugins so that Flow-stripped (TS-like), JSX-bearing, or
        // `import.meta`-using `.js` source is readable regardless of whether the
        // Flow pre-pass ran first.
        const mergedParserPlugins =
          (mergedOptions.parserOpts?.plugins as string[] | undefined) ?? [];
        const parserPluginNames = new Set<string>(mergedParserPlugins);
        parserPluginNames.add('typescript');
        parserPluginNames.add('jsx');
        parserPluginNames.add('importMeta');
        const parserOpts: babel.InputOptions['parserOpts'] = {
          plugins: [...parserPluginNames] as NonNullable<
            NonNullable<babel.InputOptions['parserOpts']>['plugins']
          >,
        };

        const result = babel.transformSync(inputCode, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          ...mergedOptions,
          parserOpts,
          // Reanimated's plugin must run last so it sees already-transformed code.
          plugins: [...(mergedOptions.plugins ?? []), ...extraPlugins],
        });
        invariant(
          result != null && typeof result.code === 'string',
          `Failed to transform with babel: ${id}`,
        );

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

function getPreset(
  flags: TransformFlag,
  id: string,
  code?: string,
  isServe = false,
): babel.InputOptions {
  const presets: babel.PresetItem[] = [];
  const plugins: babel.PluginItem[] = [];
  // De-dupe parser plugins so a file that is both Flow + JSX (common in RN/Expo
  // deps) does not request the same parser feature twice — Babel aborts with
  // "Duplicate plugin/preset detected" otherwise.
  const parserPlugins = new Set<
    NonNullable<NonNullable<babel.InputOptions['parserOpts']>['plugins']>[number]
  >();

  const jsx = isJSX(id);
  const ts = isTS(id);

  // TypeScript / TSX: strip types, and enable JSX parsing for `.tsx`.
  if (ts) {
    plugins.push([
      require.resolve('@babel/plugin-transform-typescript'),
      { isTSX: jsx, allowNamespaces: true },
    ]);
    if (jsx) {
      parserPlugins.add('jsx');
    }
  }

  // React Native / Expo ship raw JSX inside plain `.js`/`.mjs` files (and of
  // course `.jsx`/`.tsx`). Because transform hooks are not guaranteed to be
  // chained to oxc in every rolldown build, Babel may receive that raw JSX and
  // must be able to parse it. Enable the `jsx` parser for every native script
  // (`.js`/`.jsx`/`.mjs`/`.cjs`/`.tsx`) — a plain `.ts` without JSX does not
  // need it. No `@babel/plugin-transform-react-jsx` is required (and the v7
  // plugin would reject this package's `@babel/core@8`); oxc performs the
  // actual JSX → JS transform via `moduleTypes`.
  if (jsx || (!ts && /\.(m?js|c?js)$/.test(id))) {
    parserPlugins.add('jsx');
  }

  // Flow: flagged by the `rollipop:react-native-strip-flow-syntax` plugin
  // (content carrying `@flow`/`@format`), OR detected here directly from the
  // source when the flag is unavailable (transform hooks are not guaranteed to
  // be chained in every rolldown build). Flow files are stripped to TS-like
  // source, so they need the `typescript` parser.
  const isFlow =
    Boolean(flags & TransformFlag.STRIP_FLOW_REQUIRED) ||
    (/\.(m?js|c?js)$/.test(id) && code != null && /@flow|@format/.test(code));

  if (isFlow) {
    parserPlugins.add('typescript');
  }

  if (flags & TransformFlag.CODEGEN_REQUIRED && !isServe) {
    plugins.push(reactNativeCodegenPlugin);
  }

  const options: babel.InputOptions = {
    presets,
    plugins,
  };

  if (parserPlugins.size > 0) {
    options.parserOpts = { plugins: [...parserPlugins] };
  }

  return options;
}

function reactNativeCodegenPlugin(): babel.PluginObject {
  const codegenPlugin = require(require.resolve('@react-native/babel-plugin-codegen')) as (api: {
    parse: typeof babel.parseSync;
    types: typeof babel.types;
  }) => babel.PluginObject;

  return codegenPlugin({ parse: babel.parseSync, types: babel.types });
}

export { babelPlugin as babel };
