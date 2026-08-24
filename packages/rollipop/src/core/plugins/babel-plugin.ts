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
          ? babelOptions.length > 0 ||
            needsReanimated ||
            (flags & TransformFlag.CODEGEN_REQUIRED) !== 0
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

        // React Native / Expo ship Flow source (`.js`/`.mjs`/`.cjs` with
        // `@flow`, `static readonly`, `?: ?Type`, …). The pre-order
        // `rollipop:react-native-strip-flow-syntax` plugin strips Flow with
        // `fast-flow-transform` and flags the result `STRIP_FLOW_REQUIRED` +
        // `moduleType: 'tsx'`. For files it DID NOT strip (the common case: a
        // plain `.js`/`.mjs` with no `@flow` marker but Flow-ish or TS-ish
        // syntax, or when transform hooks are not chained in every rolldown
        // build), we make Babel self-sufficient and strip Flow here so the
        // resulting source is TS-like and re-emits a *valid* sourcemap (the
        // pre-stripped variant is what kept the dev-server sourcemap merger
        // green). This must NOT run for codegen files: they keep their original
        // Flow (the `@react-native/codegen` plugin parses Flow itself) and are
        // handled by `getPreset` with the `flow` parser. `stripFlowTypes` is
        // idempotent — already-stripped/non-Flow source passes through untouched.
        const isPlainJs = /\.(m?js|c?js|m?jsx|c?jsx)$/.test(id);
        const isCodegenFile = (flags & TransformFlag.CODEGEN_REQUIRED) !== 0;
        let inputCode = code;
        if (isPlainJs && !isCodegenFile) {
          try {
            inputCode = (await stripFlowTypes(id, code)).code;
          } catch {
            inputCode = code;
          }
        }

        const mergedOptions = mergeBabelOptions([...baseOptions, ...babelOptions]);

        // `getPreset` attaches the correct base parser plugins: `flow` (+`jsx`)
        // for codegen/Flow source, `typescript`+`jsx` for TS/TSX. For the common
        // case (plain `.js`/`.mjs` RN/Expo deps that ship TS syntax like
        // `import type`, `enum`, or JSX without a `@flow` marker), `getPreset`
        // does not add `typescript` (it keys off the `@flow` marker / TS
        // extension), so we force `typescript` + `jsx` here for every non-codegen
        // script — mirroring the prior behavior that kept these modules
        // parseable. For codegen files `getPreset` already set `flow`; forcing
        // `typescript` on top would make Babel abort with "Cannot combine flow
        // and typescript plugins", so we skip it there. `importMeta` is always
        // safe to add.
        const mergedParserPlugins =
          (mergedOptions.parserOpts?.plugins as string[] | undefined) ?? [];
        const parserPluginNames = new Set<string>(mergedParserPlugins);
        if (!isCodegenFile) {
          parserPluginNames.add('typescript');
        }
        if (!parserPluginNames.has('jsx')) {
          parserPluginNames.add('jsx');
        }
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
          // Codegen view-config modules (`*NativeComponent.js`) are internal RN
          // modules — their sourcemaps are not needed for the dev/HMR
          // experience, and babel's Flow-stripped sourcemaps for them contain a
          // 0-length mapping segment that rolldown's sourcemap merger rejects
          // ("Mapping segment had an unsupported size of 0"). Drop the sourcemap
          // for these files so the final bundle's sourcemap stays valid.
          sourceMaps: isCodegenFile ? false : true,
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

  // Codegen: `NativeComponent` files (`*NativeComponent.js`) are parsed by the
  // `@react-native/babel-plugin-codegen` plugin, which runs its OWN Flow parser
  // over the *original* source to extract the native view schema. So the Flow
  // syntax (`T: {...}` generic bounds, `...ViewProps` spreads) must be
  // preserved and parsed with the **`flow`** parser — NOT `typescript`, which
  // rejects Flow-only syntax (`Unexpected token, expected ","`). When a codegen
  // file is also a plain `.js`/`.mjs`, add `jsx` too so JSX-bearing codegen
  // modules parse. The codegen plugin itself is pushed below. Codegen MUST run
  // in serve (dev) mode too — React Native core view components (e.g.
  // `DebuggingOverlay` used by `AppContainer`) need their JS view config
  // generated at dev time, exactly like Metro does. Skipping it in serve mode
  // leaves those components with no view config ("View config not found").
  const isCodegen = Boolean(flags & TransformFlag.CODEGEN_REQUIRED);
  if (isCodegen) {
    parserPlugins.add('flow');
    if (jsx || /\.(m?js|c?js|jsx|tsx)$/.test(id)) {
      parserPlugins.add('jsx');
    }
  }

  // Flow (non-codegen): flagged by the `rollipop:react-native-strip-flow-syntax`
  // pre-pass (`STRIP_FLOW_REQUIRED`), OR detected here directly from the source
  // when the flag is unavailable (transform hooks are not guaranteed to be
  // chained in every rolldown build). These files have already been stripped to
  // TS-like syntax by the pre-pass, so they need the `typescript` parser. Codegen
  // files are intentionally excluded above — they keep Flow and use `flow`.
  const isFlow =
    !isCodegen &&
    (Boolean(flags & TransformFlag.STRIP_FLOW_REQUIRED) ||
      (/\.(m?js|c?js)$/.test(id) && code != null && /@flow|@format/.test(code)));

  if (isFlow) {
    parserPlugins.add('typescript');
  }

  if (isCodegen) {
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
