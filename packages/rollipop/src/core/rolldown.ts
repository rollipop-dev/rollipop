import fs from 'node:fs';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import type { TransformOptions } from '@rollipop/rolldown/utils';
import { invariant, isNotNil, merge } from 'es-toolkit';

import { asLiteral, iife, nodeEnvironment } from '../common/code';
import { isDebugEnabled } from '../common/env';
import { Polyfill, type ResolvedConfig, type RollipopReactNativeWorkletsConfig } from '../config';
import { applyOverrideRolldownOptions } from '../config/compose-override';
import { getGlobalVariables } from '../internal/react-native';
import { ResolvedBuildOptions } from '../utils/build-options';
import { resolveHmrConfig } from '../utils/config';
import { defineEnvFromObject } from '../utils/env';
import { resolveFrom, resolvePackageJson } from '../utils/node-resolve';
import {
  CompatStatusReporter,
  mergeReporters,
  ProgressBarStatusReporter,
} from '../utils/reporters';
import { resolveRuntimeTarget } from '../utils/runtime-target';
import { getBaseUrl } from '../utils/server';
import { getBuildTotalModules } from '../utils/storage';
import { loadEnv } from './env';
import {
  type BabelPluginOptions,
  type DevServerPluginOptions,
  type PreludePluginOptions,
  type ReactNativePluginOptions,
  type ReporterPluginOptions,
  type SwcPluginOptions,
  babel,
  devServer,
  json,
  prelude,
  reactNative,
  reporter,
  swc,
} from './plugins';
import { printPluginLog } from './plugins/context';
import { withTransformBoundary } from './plugins/utils/transform-utils';
import type { BundlerContext, DevEngineOptions } from './types';

export interface RolldownOptions {
  input?: rolldown.InputOptions;
  output?: rolldown.OutputOptions;
}

resolveRolldownOptions.cache = new Map<string, RolldownOptions>();

export async function resolveRolldownOptions(
  context: BundlerContext,
  config: ResolvedConfig,
  buildOptions: ResolvedBuildOptions,
  devEngineOptions?: DevEngineOptions,
): Promise<RolldownOptions> {
  const cachedOptions = resolveRolldownOptions.cache.get(context.id);

  if (cachedOptions != null) {
    return cachedOptions;
  }

  const { platform, dev, cache } = buildOptions;
  const isDevServerMode = dev && context.buildType === 'serve';

  invariant(
    isDevServerMode ? devEngineOptions != null : true,
    'devEngineOptions is required in dev server mode',
  );

  const env = loadEnv(config);
  const builtInEnv = {
    MODE: config.mode,
    ...(isDevServerMode
      ? {
          BASE_URL: getBaseUrl(
            devEngineOptions!.host,
            devEngineOptions!.port,
            devEngineOptions!.https,
          ),
        }
      : null),
  };

  const hmrConfig = resolveHmrConfig(config);
  const hmrEnabled = hmrConfig != null;

  // Resolver
  const {
    sourceExtensions,
    assetExtensions,
    preferNativePlatform,
    external: rolldownExternal,
    ...rolldownResolve
  } = config.resolver;

  // Serializer
  const {
    polyfills,
    banner: rolldownBanner,
    footer: rolldownFooter,
    postBanner: rolldownPostBanner,
    postFooter: rolldownPostFooter,
    intro: rolldownIntro,
    outro: rolldownOutro,
    shimMissingExports: rolldownShimMissingExports,
  } = config.serializer;

  // Transformer
  const { flow: _flow, babel: _babel, swc: _swc, ...rolldownTransform } = config.transformer;

  // Optimization
  const {
    treeshake: rolldownTreeshake,
    minify: rolldownMinify,
    lazyBarrel: rolldownLazyBarrel,
    ...rolldownOptimization
  } = config.optimization;

  // React Native specific options
  const { globalIdentifiers: rolldownGlobalIdentifiers } = config.reactNative;

  // Sourcemap specific options
  const {
    sourcemap: rolldownSourcemap,
    sourcemapBaseUrl: rolldownSourcemapBaseUrl,
    sourcemapDebugIds: rolldownSourcemapDebugIds,
    sourcemapIgnoreList: rolldownSourcemapIgnoreList,
    sourcemapPathTransform: rolldownSourcemapPathTransform,
  } = config;

  // User Plugins
  const userPlugins = config.plugins;

  const mergedResolveOptions = merge(
    {
      extensions: getResolveExtensions({
        sourceExtensions,
        assetExtensions,
        platform,
        preferNativePlatform,
      }),
    } satisfies rolldown.InputOptions['resolve'],
    rolldownResolve,
  );

  const mergedTransformOptions = merge(
    {
      cwd: config.root,
      target: 'esnext',
      jsx: {
        runtime: 'automatic',
        development: dev,
      },
      define: {
        __DEV__: asLiteral(dev),
        'process.env.NODE_ENV': asLiteral(nodeEnvironment(dev)),
        'process.env.DEBUG_ROLLIPOP': asLiteral(isDebugEnabled()),
        ...(hmrEnabled ? null : { 'import.meta.hot': '{}' }),
        ...defineEnvFromObject(env),
        ...defineEnvFromObject(builtInEnv),
      },
      helpers: {
        mode: 'Runtime',
      },
    } satisfies TransformOptions,
    rolldownTransform,
  );

  const preludePluginOptions = resolvePreludePluginOptions(config);
  const reactNativePluginOptions = await resolveReactNativePluginOptions(
    config,
    context,
    buildOptions,
  );
  const babelPluginOptions = resolveBabelPluginOptions(config);
  const swcPluginOptions = resolveSwcPluginOptions(config);
  const devServerPluginOptions = resolveDevServerPluginOptions(config, hmrConfig);
  const reporterPluginOptions = resolveReporterPluginOptions(config, context, buildOptions);

  const inputOptions: rolldown.InputOptions = {
    platform: 'neutral',
    cwd: config.root,
    input: config.entry,
    tsconfig: config.tsconfig,
    resolve: mergedResolveOptions,
    transform: mergedTransformOptions,
    treeshake: rolldownTreeshake,
    external: rolldownExternal,
    shimMissingExports: rolldownShimMissingExports,
    optimization: rolldownOptimization,
    experimental: {
      lazyBarrel: rolldownLazyBarrel,
      ...(isDevServerMode
        ? { devMode: hmrConfig ? { implement: hmrConfig.runtimeImplement } : false }
        : null),
    },
    plugins: withTransformBoundary(context, [
      prelude(preludePluginOptions),
      reactNative(reactNativePluginOptions),
      json(),
      babel(babelPluginOptions),
      swc(swcPluginOptions),
      devServer(devServerPluginOptions),
      reporter(reporterPluginOptions),
      userPlugins,
    ]),
    checks: {
      /**
       * Disable eval check because react-native uses `eval` to execute code.
       */
      eval: false,
      pluginTimings: isDebugEnabled(),
    },
    logLevel: isDebugEnabled() ? 'debug' : 'info',
    onLog(level, log, defaultHandler) {
      if (log.code?.startsWith('PLUGIN_')) {
        printPluginLog(level, log, log.plugin);
      } else {
        defaultHandler(level, log);
      }
    },
    // `@rollipop/rolldown` specific options
    id: context.id,
  };

  const outputOptions: rolldown.OutputOptions = {
    format: 'esm',
    file: buildOptions.outfile,
    banner: rolldownBanner,
    footer: rolldownFooter,
    postFooter: rolldownPostFooter,
    postBanner: rolldownPostBanner,
    outro: rolldownOutro,
    intro: async (chunk) => {
      return [
        ...getGlobalVariables(dev, context.buildType),
        ...loadPolyfills(polyfills),
        typeof rolldownIntro === 'function' ? await rolldownIntro(chunk) : rolldownIntro,
      ]
        .filter(isNotNil)
        .join('\n');
    },
    minify: buildOptions.minify ?? rolldownMinify,
    sourcemap: buildOptions.sourcemap ?? rolldownSourcemap,
    sourcemapBaseUrl: rolldownSourcemapBaseUrl,
    sourcemapDebugIds: rolldownSourcemapDebugIds,
    sourcemapIgnoreList: rolldownSourcemapIgnoreList,
    sourcemapPathTransform:
      rolldownSourcemapPathTransform ?? createProjectRootSourcemapPathTransform(config.root),
    codeSplitting: false,
    strictExecutionOrder: true,
    // `@rollipop/rolldown` specific options
    globalIdentifiers: rolldownGlobalIdentifiers,
    persistentCache: cache,
  };

  const finalOptions = await applyDangerouslyOverrideOptionsFinalizer(
    config,
    inputOptions,
    outputOptions,
  );

  resolveRolldownOptions.cache.set(context.id, finalOptions);

  return finalOptions;
}

function resolvePreludePluginOptions(config: ResolvedConfig): PreludePluginOptions {
  return {
    modulePaths: config.serializer.prelude,
  };
}

async function resolveReactNativePluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
): Promise<ReactNativePluginOptions> {
  return {
    projectRoot: config.root,
    platform: buildOptions.platform,
    preferNativePlatform: config.resolver.preferNativePlatform,
    buildType: context.buildType,
    assetsDir: buildOptions.assetsDir,
    assetExtensions: config.resolver.assetExtensions,
    assetRegistryPath: await resolveAssetRegistryPath(config),
    flowFilter: config.transformer.flow?.filter ?? [],
    codegenFilter: config.reactNative.codegen?.filter ?? [],
    builtinPluginConfig: resolveReactNativeBuiltinPluginConfig(config),
  };
}

async function resolveAssetRegistryPath(config: ResolvedConfig): Promise<string> {
  const { assetRegistryPath } = config.reactNative;
  const path =
    typeof assetRegistryPath === 'function'
      ? await assetRegistryPath(config.root)
      : assetRegistryPath;

  return resolveFrom(config.root, path);
}

function resolveReactNativeBuiltinPluginConfig(
  config: ResolvedConfig,
): ReactNativePluginOptions['builtinPluginConfig'] {
  if (!config.experimental?.nativeTransformPipeline) {
    return null;
  }

  return {
    envName: config.mode,
    runtimeTarget: resolveRuntimeTarget(config.runtimeTarget),
    flow: config.experimental.flow,
    worklets: resolveWorkletsConfig(config),
  };
}

function resolveWorkletsConfig(
  config: ResolvedConfig,
): RollipopReactNativeWorkletsConfig | undefined {
  const { worklets } = config.experimental ?? {};

  if (worklets == null) {
    return undefined;
  }

  return merge(
    {
      isRelease: config.mode === 'production',
      pluginVersion: resolvePackageJson(config.root, 'react-native-worklets')?.version,
    },
    worklets,
  );
}

function resolveBabelPluginOptions(config: ResolvedConfig): BabelPluginOptions {
  return {
    useNativeTransformPipeline: config.experimental?.nativeTransformPipeline,
    transformConfig: config.transformer.babel,
  };
}

function resolveSwcPluginOptions(config: ResolvedConfig): SwcPluginOptions {
  return {
    useNativeTransformPipeline: config.experimental?.nativeTransformPipeline,
    runtimeTarget: config.runtimeTarget,
    transformConfig: config.transformer.swc,
  };
}

function resolveDevServerPluginOptions(
  config: ResolvedConfig,
  hmrConfig: ReturnType<typeof resolveHmrConfig>,
): DevServerPluginOptions {
  return {
    cwd: config.root,
    hmrClientPath: config.reactNative.hmrClientPath,
    hmrConfig,
  };
}

function resolveReporterPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
): ReporterPluginOptions {
  const statusReporter = createStatusReporter(config, context, buildOptions);

  return {
    initialTotalModules: getBuildTotalModules(context.storage, context.id),
    reporter: mergeReporters([statusReporter, config.reporter].filter(isNotNil)),
  };
}

function createStatusReporter(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
) {
  switch (config.terminal.status) {
    case 'compat':
      return new CompatStatusReporter();

    case 'progress':
      return new ProgressBarStatusReporter(
        context.id,
        `[${buildOptions.platform}, ${buildOptions.dev ? 'dev' : 'prod'}]`,
        getBuildTotalModules(context.storage, context.id),
      );
  }
}

export interface GetResolveExtensionsOptions {
  platform: string;
  sourceExtensions: string[];
  assetExtensions: string[];
  preferNativePlatform: boolean;
}

export function getResolveExtensions({
  platform,
  sourceExtensions,
  assetExtensions,
  preferNativePlatform,
}: GetResolveExtensionsOptions) {
  const supportedExtensions = [...sourceExtensions, ...assetExtensions];
  const platforms = [platform, preferNativePlatform ? 'native' : null].filter(isNotNil);
  const resolveExtensions = [
    ...platforms.map((platform) => {
      return supportedExtensions.map((extension) => `.${platform}.${extension}`);
    }),
    ...supportedExtensions.map((extension) => `.${extension}`),
  ].flat();

  return resolveExtensions;
}

/**
 * Default sourcemap path transform.
 *
 * Rolldown emits `sources` relative to the bundle output's directory, which
 * yields paths like `../App.tsx` when the bundle lives under e.g. `dist/`.
 * RN tooling (symbolication, devtools) expects project-root-relative paths,
 * so this rewrites each entry to be relative to `projectRoot`.
 */
function createProjectRootSourcemapPathTransform(
  projectRoot: string,
): NonNullable<rolldown.OutputOptions['sourcemapPathTransform']> {
  return (source, sourcemapPath) => {
    const absolute = path.resolve(path.dirname(sourcemapPath), source);
    return path.relative(projectRoot, absolute);
  };
}

function loadPolyfills(polyfills: Polyfill[]) {
  return polyfills.map((polyfill) => {
    if (typeof polyfill === 'string') {
      return fs.readFileSync(polyfill, 'utf-8');
    }

    const path = 'path' in polyfill ? polyfill.path : undefined;
    const content = 'code' in polyfill ? polyfill.code : fs.readFileSync(polyfill.path, 'utf-8');

    return polyfill.type === 'iife' ? iife(content, path) : content;
  });
}

async function applyDangerouslyOverrideOptionsFinalizer(
  config: ResolvedConfig,
  inputOptions: rolldown.InputOptions,
  outputOptions: rolldown.OutputOptions,
) {
  const override = config.dangerously_overrideRolldownOptions;
  if (override == null) {
    return { input: inputOptions, output: outputOptions };
  }
  return await applyOverrideRolldownOptions(override, {
    input: inputOptions,
    output: outputOptions,
  });
}

export function getOverrideOptionsForDevServer(buildOptions: ResolvedBuildOptions) {
  const input: rolldown.InputOptions = {
    transform: {
      jsx: {
        development: true,
      },
    },
    experimental: {
      incrementalBuild: true,
      nativeMagicString: true,
    },
    treeshake: false,
  };

  const output: rolldown.OutputOptions = {
    minify: buildOptions.minify ?? false,
    sourcemap: buildOptions.sourcemap ?? true,
    generatedCode: {
      symbols: buildOptions.dev,
      profilerNames: buildOptions.dev,
    },
  };

  return { input, output };
}
