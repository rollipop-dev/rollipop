import fs from 'node:fs';
import path from 'node:path';

import { isDebugEnabled } from '../common/env';
import { stripFlowTypes } from '../common/transformer';
import {
  DEFAULT_ANALYZE_FILE,
  DEFAULT_ANALYZE_REPORT_FILE,
  DEFAULT_ASSET_EXTENSIONS,
  DEFAULT_ASSET_REGISTRY_PATH,
  DEFAULT_ENV_FILE,
  DEFAULT_ENV_PREFIX,
  DEFAULT_HMR_CLIENT_PATH,
  DEFAULT_RESOLVER_ALIAS_FIELDS,
  DEFAULT_RESOLVER_CONDITION_NAMES,
  DEFAULT_RESOLVER_MAIN_FIELDS,
  DEFAULT_RUNTIME_TARGET,
  DEFAULT_SOURCE_EXTENSIONS,
} from '../constants';
import { ClientLogReporter } from '../events/builtin-reporters';
import { getPolyfillScriptPaths } from '../internal/react-native';
import type { Reporter } from '../types';
import { resolvePackagePath } from '../utils/node-resolve';
import type { PluginFlattenConfig } from './merge-config';
import type {
  AnalyzerConfig,
  Config,
  DevConfig,
  Polyfill,
  ReactNativeConfig,
  TerminalConfig,
} from './types';

/** Expo/Metro entry discovery. The app entry is not always `index.js` — it may
 *  be `index.ts(x)`, or be declared via `package.json` `main` / `expo.entry`.
 *  Hardcoding `index.js` breaks any app whose entry uses a different extension
 *  (e.g. Vautr mobile's `index.ts`), producing
 *  `[UNLOADABLE_DEPENDENCY] Could not load index.js`. Mirror Metro/Expo: prefer
 *  an explicit `main`/`expo.entry`, then discover `index.[tsx|ts|js|jsx]`. */
function resolveDefaultEntry(projectRoot: string): string {
  const candidates = ['index.tsx', 'index.ts', 'index.js', 'index.jsx'];
  // package.json `main` (or `expo.entry`) wins when it points at a real file.
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        main?: string;
        expo?: { entry?: string };
      };
      const declared = pkg.expo?.entry ?? pkg.main;
      if (declared && typeof declared === 'string') {
        const abs = path.isAbsolute(declared) ? declared : path.resolve(projectRoot, declared);
        if (fs.existsSync(abs)) return abs;
        // Allow extension-less/bare `main` (e.g. "index") to match a discovered file.
        for (const ext of ['', '.tsx', '.ts', '.jsx', '.js']) {
          const withExt = abs + ext;
          if (fs.existsSync(withExt)) return withExt;
        }
      }
    }
  } catch {
    // fall through to extension discovery
  }
  for (const candidate of candidates) {
    const abs = path.join(projectRoot, candidate);
    if (fs.existsSync(abs)) return abs;
  }
  // Default to index.js (Metro-compatible fallback) even if absent; the loader
  // will surface a clear "could not load" error rather than a wrong file.
  return path.resolve(projectRoot, 'index.js');
}

export async function getDefaultConfig(projectRoot: string, mode?: Config['mode']) {
  let reactNativePath: string;
  try {
    reactNativePath =
      process.env.ROLLIPOP_REACT_NATIVE_PATH ?? resolvePackagePath(projectRoot, 'react-native');
  } catch {
    throw new Error(
      `Could not resolve 'react-native' package path. Please check your project path.`,
    );
  }

  const defaultConfig = {
    root: projectRoot,
    mode: mode ?? 'development',
    entry: resolveDefaultEntry(projectRoot),
    resolve: {
      sourceExtensions: DEFAULT_SOURCE_EXTENSIONS,
      assetExtensions: DEFAULT_ASSET_EXTENSIONS,
      mainFields: DEFAULT_RESOLVER_MAIN_FIELDS,
      aliasFields: DEFAULT_RESOLVER_ALIAS_FIELDS,
      conditionNames: DEFAULT_RESOLVER_CONDITION_NAMES,
      preferNativePlatform: true,
      symlinks: true,
    },
    transform: {
      flow: {
        // Strip Flow only from files that actually carry a Flow signature.
        // RN 0.7x+ ships Flow (`@flow`) with TS-ish syntax (`static readonly`,
        // `?: ?Type`) that only `fast-flow-transform` understands. Matching on
        // the `@flow`/`@format` marker (not the bare `.js` extension) keeps the
        // Flow strip — and the matching `typescript` Babel parser it enables —
        // away from plain app/runtime modules (e.g. the `\0rolldown/runtime.js`
        // virtual module), which would otherwise be mis-parsed.
        filter: {
          id: /\.(m?js|c?js)$/,
          code: /@flow|@format/,
        },
      },
    },
    prelude: [path.join(reactNativePath, 'Libraries/Core/InitializeCore.js')] as string[],
    polyfills: (await Promise.all(
      getPolyfillScriptPaths(reactNativePath).map(async (path) => {
        const code = fs.readFileSync(path, 'utf-8');
        const result = await stripFlowTypes(path, code);

        return {
          type: 'iife',
          code: result.code,
        } satisfies Polyfill;
      }),
    )) as Polyfill[],
    output: {},
    treeshake: true as NonNullable<Config['treeshake']>,
    reactNative: {
      reactNativePath,
      codegen: {
        /**
         * @see {@link https://github.com/facebook/react-native/blob/v0.83.1/packages/react-native-babel-preset/src/configs/main.js#L78}
         *
         * Matches React Native's native-component codegen modules: the
         * `codegenNativeComponent` helper module itself
         * (`Libraries/Utilities/codegenNativeComponent.js`) and every
         * `*NativeComponent.js` view module that calls it (e.g.
         * `VirtualViewNativeComponent.js`). These files ship Flow-only syntax
         * (`T: {...}` generic bounds) that must be parsed with the Flow parser
         * and handed to `@react-native/babel-plugin-codegen` unchanged. The
         * previous `/\\bcodegenNativeComponent</` pattern required a literal `<`
         * after the name and therefore matched nothing — so the codegen flag was
         * never set and the raw Flow source reached oxc, which rejects it with
         * "[PARSE_ERROR] Flow is not supported".
         */
        filter: {
          // Precise "source-content detection": match a module whose id ends in
          // `*NativeComponent.js` AND whose source imports the
          // `codegenNativeComponent` helper (detected via the import path
          // string, which survives rollipop's import-rewriting — the binding
          // name does not). This catches RN-core codegen view modules
          // (`DebuggingOverlayNativeComponent.js`, `VirtualViewNativeComponent.js`,
          // …) while excluding legacy `*NativeComponent.js` modules
          // (`TextNativeComponent.js`, which uses the old
          // `createReactNativeComponentClass` API and cannot be parsed by the
          // Flow parser).
          id: /(^|\/)codegenNativeComponent\.(js|jsx|ts|tsx)$|NativeComponent\.(js|jsx|ts|tsx)$/,
          code: /codegenNativeComponent['"]/,
        },
      },
      assetRegistryPath: DEFAULT_ASSET_REGISTRY_PATH as NonNullable<
        NonNullable<ReactNativeConfig>['assetRegistryPath']
      >,
      hmrClientPath: DEFAULT_HMR_CLIENT_PATH as NonNullable<
        NonNullable<ReactNativeConfig>['hmrClientPath']
      >,
    },
    dev: {
      watch: {
        skipWrite: true,
        useDebounce: true,
        debounceDuration: 50,
      },
      hmr: true as NonNullable<DevConfig['hmr']>,
    },
    reporter: new ClientLogReporter() as Reporter,
    analyzer: {
      enabled: false,
      analyzeFile: DEFAULT_ANALYZE_FILE,
      reportFile: DEFAULT_ANALYZE_REPORT_FILE,
      autoOpen: false,
    } as Required<AnalyzerConfig>,
    terminal: {
      status: ((): TerminalConfig['status'] => {
        if (isDebugEnabled()) {
          return 'compat';
        }
        if (process.stderr.isTTY) {
          return 'progress';
        }
        return 'compat';
      })(),
    },
    envDir: projectRoot,
    envFile: DEFAULT_ENV_FILE as NonNullable<Config['envFile']>,
    envPrefix: DEFAULT_ENV_PREFIX as NonNullable<Config['envPrefix']>,
    runtimeTarget: DEFAULT_RUNTIME_TARGET as NonNullable<Config['runtimeTarget']>,
    experimental: {
      nativeTransformPipeline: false as boolean,
    },
  } satisfies Config;

  return defaultConfig;
}

export interface InternalConfig {
  /**
   * The path to the config file that was used to load the config.
   */
  configFile: string;
}

export type DefaultConfig = Awaited<ReturnType<typeof getDefaultConfig>>;
export type ResolvedConfig = DefaultConfig & PluginFlattenConfig & InternalConfig;
