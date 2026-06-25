import fs from 'node:fs';

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
import { getInitializeCorePath, getPolyfillScriptPaths } from '../internal/react-native';
import type { Reporter } from '../types';
import { resolvePackagePath } from '../utils/node-resolve';
import { ClientLogReporter } from '../utils/reporters';
import type { PluginFlattenConfig } from './merge-config';
import type {
  AnalyzerConfig,
  Config,
  DevModeConfig,
  OptimizationConfig,
  Polyfill,
  ReactNativeConfig,
  TerminalConfig,
} from './types';

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
    entry: 'index.js',
    resolver: {
      sourceExtensions: DEFAULT_SOURCE_EXTENSIONS,
      assetExtensions: DEFAULT_ASSET_EXTENSIONS,
      mainFields: DEFAULT_RESOLVER_MAIN_FIELDS,
      aliasFields: DEFAULT_RESOLVER_ALIAS_FIELDS,
      conditionNames: DEFAULT_RESOLVER_CONDITION_NAMES,
      preferNativePlatform: true,
      symlinks: true,
    },
    transformer: {
      flow: {
        filter: {
          id: /\.jsx?$/,
          code: /@flow/,
        },
      },
    },
    serializer: {
      prelude: [getInitializeCorePath(projectRoot)] as string[],
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
    },
    watcher: {
      skipWrite: true,
      useDebounce: true,
      debounceDuration: 50,
    },
    optimization: {
      treeshake: true as NonNullable<OptimizationConfig['treeshake']>,
    },
    reactNative: {
      reactNativePath,
      codegen: {
        /**
         * @see {@link https://github.com/facebook/react-native/blob/v0.83.1/packages/react-native-babel-preset/src/configs/main.js#L78}
         */
        filter: {
          code: /\bcodegenNativeComponent</,
        },
      },
      assetRegistryPath: DEFAULT_ASSET_REGISTRY_PATH as NonNullable<
        NonNullable<ReactNativeConfig>['assetRegistryPath']
      >,
      hmrClientPath: DEFAULT_HMR_CLIENT_PATH as NonNullable<
        NonNullable<ReactNativeConfig>['hmrClientPath']
      >,
    },
    devMode: {
      hmr: true as NonNullable<DevModeConfig['hmr']>,
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
