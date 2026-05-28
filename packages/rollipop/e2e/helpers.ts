import fs from 'node:fs';
import path from 'node:path';

import type { OutputChunk } from '@rollipop/rolldown';

import type { ResolvedConfig } from '../src/config/defaults';
import type { Config, Polyfill } from '../src/config/types';
import {
  DEFAULT_ENV_FILE,
  DEFAULT_ENV_PREFIX,
  DEFAULT_RESOLVER_CONDITION_NAMES,
  DEFAULT_RESOLVER_MAIN_FIELDS,
  DEFAULT_RUNTIME_TARGET,
  DEFAULT_SOURCE_EXTENSIONS,
} from '../src/constants';
import { Bundler } from '../src/core/bundler';
import type { Plugin } from '../src/core/plugins/types';
import { resolveRolldownOptions } from '../src/core/rolldown';
import type { BuildOptions } from '../src/core/types';
import type { Reporter } from '../src/types';

export const FIXTURES_DIR = path.resolve(import.meta.dirname, '__fixtures__');

export function fixturePath(...segments: string[]): string {
  return path.join(FIXTURES_DIR, ...segments);
}

export interface TestConfigOptions {
  entry?: string;
  mode?: Config['mode'];
  plugins?: Plugin[];
  resolver?: Partial<NonNullable<Config['resolver']>> & Record<string, unknown>;
  transformer?: Partial<NonNullable<Config['transformer']>>;
  serializer?: Partial<NonNullable<Config['serializer']>> & { polyfills?: Polyfill[] };
  optimization?: Partial<NonNullable<Config['optimization']>>;
  reactNative?: Partial<NonNullable<Config['reactNative']>>;
  sourcemap?: Config['sourcemap'];
  sourcemapBaseUrl?: Config['sourcemapBaseUrl'];
  sourcemapDebugIds?: Config['sourcemapDebugIds'];
  sourcemapIgnoreList?: Config['sourcemapIgnoreList'];
  sourcemapPathTransform?: Config['sourcemapPathTransform'];
  envDir?: string;
  envFile?: string;
  envPrefix?: string;
  experimental?: Partial<NonNullable<Config['experimental']>>;
  reporter?: Reporter;
  dangerously_overrideRolldownOptions?: Config['dangerously_overrideRolldownOptions'];
}

export function createConfig(fixture: string, options: TestConfigOptions = {}): ResolvedConfig {
  const root = fixturePath(fixture);

  // Note: getDefaultConfig() requires react-native, so we construct manually
  // using imported constants to avoid duplicating default values.
  return {
    root,
    mode: options.mode ?? 'production',
    entry: path.resolve(root, options.entry ?? 'index.ts'),
    tsconfig: false,
    resolver: {
      sourceExtensions: DEFAULT_SOURCE_EXTENSIONS,
      assetExtensions: [],
      mainFields: DEFAULT_RESOLVER_MAIN_FIELDS,
      conditionNames: DEFAULT_RESOLVER_CONDITION_NAMES,
      preferNativePlatform: true,
      symlinks: true,
      ...options.resolver,
    },
    transformer: {
      flow: { filter: { id: /\.jsx?$/, code: /@flow/ } },
      ...options.transformer,
    },
    serializer: {
      prelude: [],
      polyfills: [],
      ...options.serializer,
    },
    watcher: { skipWrite: true, useDebounce: true, debounceDuration: 50 },
    optimization: {
      treeshake: true,
      ...options.optimization,
    },
    reactNative: {
      reactNativePath: '',
      codegen: { filter: { code: /(?!)/ } },
      assetRegistryPath: '/dummy-asset-registry.js',
      hmrClientPath: path.resolve(FIXTURES_DIR, '_mock', 'hmr-client.js'),
      globalIdentifiers: [],
      ...options.reactNative,
    },
    devMode: { hmr: false },
    experimental: {
      nativeTransformPipeline: false,
      ...options.experimental,
    },
    reporter: options.reporter,
    terminal: { status: 'none' },
    envDir: options.envDir ?? root,
    envFile: options.envFile ?? DEFAULT_ENV_FILE,
    envPrefix: options.envPrefix ?? DEFAULT_ENV_PREFIX,
    plugins: options.plugins ?? [],
    sourcemap: options.sourcemap,
    sourcemapBaseUrl: options.sourcemapBaseUrl,
    sourcemapDebugIds: options.sourcemapDebugIds,
    sourcemapIgnoreList: options.sourcemapIgnoreList,
    sourcemapPathTransform: options.sourcemapPathTransform,
    dangerously_overrideRolldownOptions: options.dangerously_overrideRolldownOptions,
    runtimeTarget: DEFAULT_RUNTIME_TARGET,
  } as unknown as ResolvedConfig;
}

export async function build(
  fixture: string,
  options: TestConfigOptions = {},
  buildOptions: Partial<BuildOptions> = {},
): Promise<OutputChunk> {
  resolveRolldownOptions.cache.clear();

  const config = createConfig(fixture, options);
  const bundler = new Bundler(config);

  return bundler.build({
    platform: 'android',
    dev: false,
    cache: false,
    ...buildOptions,
  });
}

export async function buildToFile(
  fixture: string,
  outDir: string,
  options: TestConfigOptions = {},
  buildOptions: Partial<BuildOptions> = {},
): Promise<{ chunk: OutputChunk; outfile: string; readOutput: () => string }> {
  const outfile = path.join(fixturePath(fixture), outDir, 'bundle.js');

  const chunk = await build(fixture, options, {
    outfile: path.join(outDir, 'bundle.js'),
    ...buildOptions,
  });

  return {
    chunk,
    outfile,
    readOutput: () => fs.readFileSync(outfile, 'utf-8'),
  };
}

export function cleanup(fixture: string, outDir: string) {
  fs.rmSync(path.join(fixturePath(fixture), outDir), {
    recursive: true,
    force: true,
  });
}
