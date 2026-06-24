import path from 'node:path';

import type { Config, ResolvedConfig } from '../config';
import {
  DEFAULT_ANALYZE_FILE,
  DEFAULT_ANALYZE_REPORT_FILE,
  DEFAULT_ASSET_EXTENSIONS,
  DEFAULT_ASSET_REGISTRY_PATH,
  DEFAULT_ENV_FILE,
  DEFAULT_ENV_PREFIX,
  DEFAULT_HMR_CLIENT_PATH,
  DEFAULT_REACT_NATIVE_GLOBAL_IDENTIFIERS,
  DEFAULT_RESOLVER_ALIAS_FIELDS,
  DEFAULT_RESOLVER_CONDITION_NAMES,
  DEFAULT_RESOLVER_MAIN_FIELDS,
  DEFAULT_RUNTIME_TARGET,
  DEFAULT_SOURCE_EXTENSIONS,
} from '../constants';
import type { Reporter } from '../types';

export function createTestConfig(basePath: string): ResolvedConfig {
  const defaultConfig = {
    root: basePath,
    mode: 'development',
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
      prelude: [path.join(basePath, '__tests__/react-native/Libraries/Core/InitializeCore.js')],
      polyfills: [
        {
          type: 'iife',
          code: 'console.log("[TEST] Polyfill")',
        },
      ],
    },
    watcher: {
      skipWrite: true,
      useDebounce: true,
      debounceDuration: 50,
    },
    optimization: {
      treeshake: true,
    },
    reactNative: {
      reactNativePath: '__tests__/react-native',
      codegen: {
        filter: {
          code: /\bcodegenNativeComponent</,
        },
      },
      assetRegistryPath: DEFAULT_ASSET_REGISTRY_PATH,
      hmrClientPath: DEFAULT_HMR_CLIENT_PATH,
      globalIdentifiers: DEFAULT_REACT_NATIVE_GLOBAL_IDENTIFIERS,
    },
    devMode: {
      hmr: true,
    },
    reporter: {
      update: () => {},
    } as Reporter,
    analyzer: {
      enabled: false,
      analyzeFile: DEFAULT_ANALYZE_FILE,
      reportFile: DEFAULT_ANALYZE_REPORT_FILE,
      autoOpen: false,
    },
    terminal: {
      status: process.stderr.isTTY ? 'progress' : 'compat',
    },
    envDir: basePath,
    envFile: DEFAULT_ENV_FILE,
    envPrefix: DEFAULT_ENV_PREFIX,
    runtimeTarget: DEFAULT_RUNTIME_TARGET,
    experimental: {
      nativeTransformPipeline: false,
    },
  } satisfies Config;

  return {
    ...defaultConfig,
    configFile: path.join(basePath, 'rollipop.config.ts'),
  };
}
