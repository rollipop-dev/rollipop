import fs from 'node:fs';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import type { TransformOptions as RollipopTransformOptions } from '@rollipop/rolldown/utils';
import { invariant, isNotNil, merge } from 'es-toolkit';

import { asLiteral, iife, nodeEnvironment } from '../common/code';
import { isDebugEnabled } from '../common/env';
import type { ResolvedConfig, RollipopReactNativeWorkletsConfig } from '../config';
import { applyRolldownOptionsConfig } from '../config/compose-override';
import { ROLLIPOP_VIRTUAL_ENTRY_ID } from '../constants';
import { getGlobalVariables } from '../internal/react-native';
import type { BuildDiagnosticLog, MaybePromise, Reporter } from '../types';
import type { ResolvedBuildOptions } from '../utils/build-options';
import { resolveHmrConfig } from '../utils/config';
import { defineEnvFromObject } from '../utils/env';
import { createVirtualModuleId, escapeVirtualModuleId } from '../utils/id';
import { resolveFrom, resolvePackageJson } from '../utils/node-resolve';
import {
  CompatStatusReporter,
  mergeReporters,
  ProgressBarStatusReporter,
} from '../utils/reporters';
import { getBaseUrl } from '../utils/server';
import { getBuildTotalModules, setBuildTotalModules } from '../utils/storage';
import { transformWithRollipop } from '../utils/transform';
import { loadEnv } from './env';
import {
  type AnalyzePluginOptions,
  type AliasPluginOptions,
  type BabelPluginOptions,
  type DevServerPluginOptions,
  type EntryPluginOptions,
  type ImportGlobPluginOptions,
  type ReactNativePluginOptions,
  type ReporterPluginOptions,
  type SwcPluginOptions,
  alias,
  analyze,
  babel,
  devServer,
  entry,
  importGlob,
  reactNative,
  reporter,
  swc,
  DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
  DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
} from './plugins';
import { printPluginLog } from './plugins/context';
import { withTransformBoundary } from './plugins/utils/transform-utils';
import type { BundlerContext, DevEngineOptions } from './types';

export interface RolldownOptions {
  input?: rolldown.InputOptions;
  output?: rolldown.OutputOptions;
}

type RolldownTransformOptions = NonNullable<rolldown.InputOptions['transform']>;
type RolldownJsxOptions = Extract<NonNullable<RolldownTransformOptions['jsx']>, object>;

export async function resolveRolldownOptions(
  context: BundlerContext,
  config: ResolvedConfig,
  buildOptions: ResolvedBuildOptions,
  devEngineOptions?: DevEngineOptions,
): Promise<RolldownOptions> {
  const cacheKey = [context.id, devEngineOptions?.sourceMapUrl].filter(isNotNil).join(':');
  const cachedOptions = resolveRolldownOptions.cache.get(cacheKey);

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

  const {
    root: _root,
    mode: _mode,
    entry: _entry,
    resolve: _resolve,
    transform: _transform,
    prelude: _prelude,
    polyfills: _polyfills,
    output: _output,
    plugins: _plugins,
    reactNative: _reactNative,
    terminal: _terminal,
    reporter: _reporter,
    analyzer: _analyzer,
    dev: _dev,
    envDir: _envDir,
    envFile: _envFile,
    envPrefix: _envPrefix,
    runtimeTarget: _runtimeTarget,
    experimental: _experimental,
    rolldownOptions: _rolldownOptions,
    configFile: _configFile,
    ...rolldownInput
  } = config;

  const { sourceExtensions, assetExtensions, preferNativePlatform, ...rolldownResolve } =
    config.resolve;

  const { intro: rolldownIntro, ...rolldownOutput } = config.output;
  const {
    nativeTransformPipeline: _nativeTransformPipeline,
    flow: _experimentalFlow,
    worklets: _experimentalWorklets,
    ...rolldownExperimental
  } = config.experimental;

  const { flow: _flow, babel: _babel, swc: _swc, ...rolldownTransform } = config.transform;

  // User Plugins
  const userPlugins = config.plugins;
  const { rolldownAlias, aliasPluginOptions } = resolveAliasPluginOptions(config);

  const mergedResolveOptions = merge(
    {
      extensions: getResolveExtensions({
        sourceExtensions,
        assetExtensions,
        platform,
        preferNativePlatform,
      }),
    } satisfies rolldown.InputOptions['resolve'],
    {
      ...rolldownResolve,
      alias: rolldownAlias,
    },
  );

  const defaultTransformOptions = {
    cwd: config.root,
    target: 'esnext',
    jsx: {
      runtime: 'automatic',
      development: dev,
      compiler: undefined,
    },
    define: {
      __DEV__: asLiteral(dev),
      'process.env.NODE_ENV': asLiteral(nodeEnvironment(dev)),
      'process.env.DEBUG_ROLLIPOP': asLiteral(isDebugEnabled()),
      ...(hmrEnabled ? null : { 'import.meta.hot': 'undefined' }),
      ...defineEnvFromObject(env),
      ...defineEnvFromObject(builtInEnv),
    },
    helpers: {
      mode: 'Runtime',
    },
  } satisfies RollipopTransformOptions;
  const mergedTransformOptions = merge(
    { ...defaultTransformOptions } as RolldownTransformOptions,
    rolldownTransform,
  );
  applyReactCompilerDefaults(mergedTransformOptions);

  const entryPluginOptions = resolveEntryPluginOptions(config);
  const importGlobPluginOptions = resolveImportGlobPluginOptions(config);
  const reactNativePluginOptions = await resolveReactNativePluginOptions(
    config,
    context,
    buildOptions,
  );
  const babelPluginOptions = resolveBabelPluginOptions(config, context);
  const swcPluginOptions = resolveSwcPluginOptions(config, context);
  const devServerPluginOptions = resolveDevServerPluginOptions(config, hmrConfig, devEngineOptions);
  const reporterPluginOptions = resolveReporterPluginOptions(config, context, buildOptions);
  const analyzePluginOptions = resolveAnalyzePluginOptions(config, context);

  const inputOptions: rolldown.InputOptions = {
    ...rolldownInput,
    platform: 'neutral',
    cwd: config.root,
    input: ROLLIPOP_VIRTUAL_ENTRY_ID,
    resolve: mergedResolveOptions,
    transform: mergedTransformOptions,
    experimental: merge(
      { ...rolldownExperimental },
      isDevServerMode
        ? { devMode: hmrConfig ? { implement: hmrConfig.runtimeImplement } : false }
        : {},
    ),
    plugins: withTransformBoundary(context, [
      entry(entryPluginOptions),
      importGlob(importGlobPluginOptions),
      alias(aliasPluginOptions),
      reactNative(reactNativePluginOptions),
      babel(babelPluginOptions),
      swc(swcPluginOptions),
      devServer(devServerPluginOptions),
      reporter(reporterPluginOptions),
      analyze(analyzePluginOptions),
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
      const diagnostic = toBuildDiagnosticLog(log);
      if (level === 'warn') {
        config.reporter?.update({ type: 'build_error', level, log: diagnostic });
      } else if (isPluginLog(log)) {
        config.reporter?.update({ type: 'build_log', level, log: diagnostic });
        printPluginLog(level, log, log.plugin);
      } else {
        defaultHandler(level, log);
      }
    },
    // `@rollipop/rolldown` specific options
    id: context.id,
  };

  const outputOptions: rolldown.OutputOptions = merge(
    { ...rolldownOutput },
    {
      file: buildOptions.outfile,
      intro: async (chunk: rolldown.RenderedChunk) => {
        return [
          ...getGlobalVariables(dev),
          ...loadPolyfills(config),
          await resolveOutputAddon(rolldownIntro, chunk),
        ]
          .filter(isNotNil)
          .join('\n');
      },
      minify: buildOptions.minify ?? rolldownOutput.minify,
      sourcemap: buildOptions.sourcemap ?? rolldownOutput.sourcemap,
      sourcemapPathTransform:
        rolldownOutput.sourcemapPathTransform ??
        createProjectRootSourcemapPathTransform(config.root),
      codeSplitting: false,
      // `@rollipop/rolldown` specific options
      persistentCache: cache,
    },
  );

  const overrideOptions = isDevServerMode
    ? getOverrideOptionsForDevServer(buildOptions, hmrEnabled)
    : getOverrideOptions();
  const rolldownOptions: RolldownOptions = {
    input: merge(inputOptions, overrideOptions.input),
    output: merge(outputOptions, overrideOptions.output),
  };
  const rolldownOptionsContext: RolldownOptionsContext = Object.freeze({
    id: context.id,
    root: context.root,
    buildType: context.buildType,
    ...buildOptions,
  });
  const finalOptions = await applyRolldownOptionsFinalizer(
    config.rolldownOptions ?? null,
    rolldownOptions,
    rolldownOptionsContext,
  );

  resolveRolldownOptions.cache.set(cacheKey, finalOptions);

  return finalOptions;
}

resolveRolldownOptions.cache = new Map<string, RolldownOptions>();

function resolveEntryPluginOptions(config: ResolvedConfig): EntryPluginOptions {
  return {
    entryPath: config.entry,
    preludePaths: config.prelude,
  };
}

function resolveImportGlobPluginOptions(config: ResolvedConfig): ImportGlobPluginOptions {
  return {
    root: config.root,
    sourcemap: config.mode === 'development',
    restoreQueryExtension: false,
  };
}

function resolveAliasPluginOptions(config: ResolvedConfig): {
  rolldownAlias: NonNullable<rolldown.InputOptions['resolve']>['alias'];
  aliasPluginOptions: AliasPluginOptions;
} {
  const { alias } = config.resolve;

  if (Array.isArray(alias)) {
    return { rolldownAlias: undefined, aliasPluginOptions: { entries: alias } };
  }

  return { rolldownAlias: alias, aliasPluginOptions: { entries: [] } };
}

async function resolveReactNativePluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
): Promise<ReactNativePluginOptions> {
  return {
    context,
    projectRoot: config.root,
    platform: buildOptions.platform,
    preferNativePlatform: config.resolve.preferNativePlatform,
    buildType: context.buildType,
    assetsDir: buildOptions.assetsDir,
    assetExtensions: config.resolve.assetExtensions,
    assetRegistryPath: await resolveAssetRegistryPath(config),
    flowFilter: config.transform.flow?.filter ?? [],
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
    runtimeTarget: config.runtimeTarget,
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

function applyReactCompilerDefaults(transform: RolldownTransformOptions) {
  const jsx = transform.jsx;
  if (jsx == null || typeof jsx !== 'object') {
    return;
  }

  const jsxOptions = jsx as RolldownJsxOptions;
  if (jsxOptions.compiler == null) {
    return;
  }

  jsxOptions.compiler = {
    ...jsxOptions.compiler,
    exclude: jsxOptions.compiler.exclude ?? [/node_modules/],
  };
}

function resolveBabelPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
): BabelPluginOptions {
  return {
    context,
    useNativeTransformPipeline: config.experimental?.nativeTransformPipeline,
    transformConfig: config.transform.babel,
  };
}

function resolveSwcPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
): SwcPluginOptions {
  return {
    context,
    useNativeTransformPipeline: config.experimental?.nativeTransformPipeline,
    runtimeTarget: config.runtimeTarget,
    transformConfig: config.transform.swc,
  };
}

function resolveDevServerPluginOptions(
  config: ResolvedConfig,
  hmrConfig: ReturnType<typeof resolveHmrConfig>,
  devEngineOptions: DevEngineOptions | undefined,
): DevServerPluginOptions {
  return {
    cwd: config.root,
    hmrClientPath: config.reactNative.hmrClientPath,
    hmrConfig,
    sourceMapUrl: devEngineOptions?.sourceMapUrl,
  };
}

function resolveReporterPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
): ReporterPluginOptions {
  const statusReporter = createStatusReporter(config, context, buildOptions);
  const buildTotalModulesReporter = createBuildTotalModulesReporter(context);

  return {
    initialTotalModules: getBuildTotalModules(context.storage, context.id),
    reporter: mergeReporters(
      [buildTotalModulesReporter, statusReporter, config.reporter].filter(isNotNil),
    ),
  };
}

function resolveAnalyzePluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
): AnalyzePluginOptions {
  return {
    context,
    enabled: config.analyzer.enabled,
    analyzeFile: config.analyzer.analyzeFile,
    reportFile: config.analyzer.reportFile,
    autoOpen: config.analyzer.autoOpen,
  };
}

function createBuildTotalModulesReporter(context: BundlerContext): Reporter {
  return {
    update(event) {
      if (event.type === 'bundle_build_done') {
        setBuildTotalModules(context.storage, context.id, event.totalModules);
      }
    },
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
        config.root,
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

async function resolveOutputAddon(
  addon: rolldown.OutputOptions['intro'],
  chunk: rolldown.RenderedChunk,
) {
  return typeof addon === 'function' ? await addon(chunk) : addon;
}

function loadPolyfills(config: ResolvedConfig) {
  return config.polyfills.map((polyfill, index) => {
    if (typeof polyfill === 'string') {
      return fs.readFileSync(polyfill, 'utf-8');
    }

    const path = 'path' in polyfill ? polyfill.path : undefined;
    const content = 'code' in polyfill ? polyfill.code : fs.readFileSync(polyfill.path, 'utf-8');
    const id = createVirtualModuleId('polyfill', { index: index.toString(), path: path ?? '' });
    const code = polyfill.withTransform ? transformWithRollipop(id, content, config).code : content;

    return [
      `//#region ${escapeVirtualModuleId(id)}`,
      polyfill.type === 'iife' ? iife(code) : code,
      '//#endregion',
    ].join('\n');
  });
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

async function applyRolldownOptionsFinalizer(
  config: RolldownOptionsConfig | null,
  rolldownOptions: RolldownOptions,
  context: RolldownOptionsContext,
) {
  if (config == null) {
    return rolldownOptions;
  }
  return await applyRolldownOptionsConfig(config, rolldownOptions, context);
}

function isPluginLog(log: rolldown.RolldownLog): boolean {
  return log.plugin != null || log.code?.startsWith('PLUGIN_') === true;
}

function toBuildDiagnosticLog(log: rolldown.RolldownLog): BuildDiagnosticLog {
  return {
    code: log.code,
    plugin: log.plugin,
    message: log.message,
    stack: log.stack,
    id: log.id,
    hook: log.hook,
    frame: log.frame,
    loc: log.loc,
    meta: log.meta,
  };
}

export function getOverrideOptions() {
  const input: rolldown.InputOptions = {
    optimization: {
      /**
       * Must disable `inlineConst` option with the rollipop's custom module format.
       *
       * ```js
       * __rollipop_define__(function (global, module, __rollipop_exports__, __rollipop_require__) {
       * 	 __rollipop_require__.r(__rollipop_exports__);
       *   __rollipop_require__.d(__rollipop_exports__, { default: () => __default });
       *   var __default = 'value'; // <-- This must be a preserved as exported value. NOT inlined.
       * }, 1234);
       * ```
       */
      inlineConst: false,
    },
    experimental: {
      nativeMagicString: true,
    },
  };

  const output: rolldown.OutputOptions = {
    // `@rollipop/rolldown` specific options
    format: 'rollipop',
  };

  return { input, output };
}

export function getOverrideOptionsForDevServer(
  buildOptions: ResolvedBuildOptions,
  hmrEnabled = true,
) {
  const overrideOptions = getOverrideOptions();

  const input: rolldown.InputOptions = {
    transform: {
      jsx: {
        development: buildOptions.dev,
        ...(hmrEnabled
          ? {
              /**
               * @see `rollipopReactRefreshWrapperPlugin`
               */
              refresh: {
                refreshReg: '$RefreshReg$',
                refreshSig: '$RefreshSig$',
                // `@rollipop/rolldown` specific options
                include: DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
                exclude: DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
              },
            }
          : null),
      },
    },
    experimental: {
      incrementalBuild: true,
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

  return {
    input: merge(overrideOptions.input, input),
    output: merge(overrideOptions.output, output),
  };
}

export type RolldownOptionsFunction = (
  options: RolldownOptions,
  context: RolldownOptionsContext,
) => MaybePromise<RolldownOptions>;

export type RolldownOptionsConfig = RolldownOptions | RolldownOptionsFunction;

export type RolldownOptionsContext = Readonly<
  ResolvedBuildOptions & Pick<BundlerContext, 'id' | 'root' | 'buildType'>
>;
