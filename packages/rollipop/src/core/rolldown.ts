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
import { CompatStatusReporter, ProgressBarStatusReporter } from '../events/builtin-reporters';
import { createReporterEventListener } from '../events/consumers';
import { getExpoRouterAppRoot, isExpoBundlerMode } from '../expo/config-translator';
import { getGlobalVariables } from '../internal/react-native';
import type { BuildDiagnosticLog, MaybePromise, Reporter } from '../types';
import type { ResolvedBuildOptions } from '../utils/build-options';
import { resolveHmrConfig } from '../utils/config';
import { defineEnvFromObject } from '../utils/env';
import { createVirtualModuleId, escapeVirtualModuleId } from '../utils/id';
import { resolveFrom, resolvePackageJson } from '../utils/node-resolve';
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
  type ExpoRouterPluginOptions,
  type ExpoAssetInteropPluginOptions,
  type ImportGlobPluginOptions,
  type ReactNativePluginOptions,
  type ReactRefreshFilter,
  type ReporterPluginOptions,
  type SwcPluginOptions,
  alias,
  analyze,
  babel,
  devServer,
  entry,
  expoMetroRuntimePlugin,
  expoRouter,
  expoAssetInterop,
  importGlob,
  reactNative,
  reporter,
  swc,
  cssModule,
  selfRefDefaultInteropPlugin,
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
type RolldownReactRefreshOptions = Exclude<NonNullable<RolldownJsxOptions['refresh']>, boolean>;

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
  // React Native / Expo dependencies (e.g. `expo-router`) ship raw JSX inside
  // `.js` files. Metro parses `.js` as JSX for every RN build; oxc only does so
  // for `.jsx`/`.tsx` by default. Map `.js` -> `jsx` module type on native
  // platforms so those dependencies bundle correctly.
  const isNativePlatform = platform === 'ios' || platform === 'android' || platform === 'native';

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

  // In Expo mode, redirect `@expo/metro-runtime` (and subpaths) to Rollipop's
  // Rollipop-compatible shim. This MUST be a core `resolve.alias` entry (not a
  // plugin `resolveId` hook) because rolldown's dev engine (`rolldown.dev()`,
  // used by `rollipop start`) does not invoke user `resolveId` hooks for
  // external `node_modules` specifiers, whereas the core resolver honors
  // `resolve.alias` in both `build` and `dev` modes. The shim is a real,
  // resolvable module file (`runtime-shim.js`, the type-checked reference
  // implementation) so the native resolver can load it in either mode.
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
      // Hermes (React Native) cannot parse `import.meta` syntax at all, but it
      // *does* support `import.meta.url`. So we do NOT blanket-replace `import.meta`
      // (that would break `import.meta.url`, which libraries legitimately use).
      // Instead we only neutralize the two member accesses Hermes rejects:
      //   - `import.meta.hot`  -> `undefined` when HMR is disabled (above).
      //   - `import.meta.env`  -> `({})` because Expo/Metro replace `import.meta.env`
      //     with an empty object at build time and app code reads `import.meta.env.X`.
      // This blanket is placed BEFORE the specific env defines below so that
      // `import.meta.env.BASE_URL` etc. (resolved by `defineEnvFromObject`) take
      // precedence over the empty-object fallback for known keys.
      'import.meta.env': '({})',
      ...defineEnvFromObject(env),
      ...defineEnvFromObject(builtInEnv),
      // Expo Router reads the route root from process.env.EXPO_ROUTER_APP_ROOT
      // (Metro replaces this at build time). Without it, `require.context`
      // receives `undefined` and discovers no routes, leaving a blank screen.
      // Resolve the real router root (honoring `exp.extra.router.root` and the
      // `src/app` convention) so it matches where the Expo Router manifest
      // plugin actually scans — otherwise projects using `src/app` or a custom
      // root get a blank screen.
      'process.env.EXPO_ROUTER_APP_ROOT': asLiteral(
        path.join(config.root, getExpoRouterAppRoot(config.root)),
      ),
      // `babel-preset-expo` inlines `process.env.EXPO_OS` to the platform string
      // ('android' | 'ios' | 'web' | ...) at transform time. expo-modules-core
      // reads it in `Platform.js` to seed `Platform.OS`; without the inline it
      // stays a runtime `process.env.EXPO_OS` lookup that resolves to undefined
      // and emits "The global process.env.EXPO_OS is not defined". Only native
      // platforms have a meaningful value here (web leaves it undefined, like
      // babel-preset-expo).
      ...(isNativePlatform ? { 'process.env.EXPO_OS': asLiteral(platform) } : null),
    },
    helpers: {
      mode: 'Runtime',
    },
  } satisfies RollipopTransformOptions;
  const mergedTransformOptions = merge(defaultTransformOptions, rolldownTransform);
  applyReactCompilerDefaults(merge(defaultTransformOptions, rolldownTransform));

  const reactRefreshFilter = resolveReactRefreshFilter(mergedTransformOptions);
  const entryPluginOptions = resolveEntryPluginOptions(config, context);
  const importGlobPluginOptions = resolveImportGlobPluginOptions(config);
  const reactNativePluginOptions = await resolveReactNativePluginOptions(
    config,
    context,
    buildOptions,
  );
  const babelPluginOptions = resolveBabelPluginOptions(config, context);
  const swcPluginOptions = resolveSwcPluginOptions(config, context);
  const devServerPluginOptions = resolveDevServerPluginOptions(
    config,
    context,
    buildOptions,
    hmrConfig,
    reactRefreshFilter,
    devEngineOptions,
  );
  const reporterPluginOptions = resolveReporterPluginOptions(config, context, buildOptions);
  const analyzePluginOptions = resolveAnalyzePluginOptions(config, context);
  const expoRouterPluginOptions = resolveExpoRouterPluginOptions(config);
  const expoAssetInteropPluginOptions = resolveExpoAssetInteropPluginOptions();

  const inputOptions: rolldown.InputOptions = {
    ...rolldownInput,
    platform: 'neutral',
    cwd: config.root,
    input: ROLLIPOP_VIRTUAL_ENTRY_ID,
    resolve: mergedResolveOptions,
    transform: mergedTransformOptions,
    // See `isNativePlatform` above: parse `.js` as JSX on native platforms so
    // RN/Expo dependencies that ship JSX in `.js` (e.g. expo-router) bundle.
    // oxc's `moduleTypes` REPLACES the default extension→type map (it does not
    // merge), so we must list every extension the app uses — omitting an entry
    // silently drops that extension's JSX/TS parsing (e.g. a missing `.tsx`
    // entry makes oxc treat `.tsx` as plain JS, failing with "Unterminated
    // regular expression"). The only override vs oxc defaults is `.js`/`.mjs`
    // -> `jsx`; everything else mirrors oxc's native defaults.
    ...(isNativePlatform
      ? {
          moduleTypes: {
            '.js': 'jsx',
            '.jsx': 'jsx',
            '.mjs': 'jsx',
            '.cjs': 'js',
            '.ts': 'ts',
            '.tsx': 'tsx',
            '.mts': 'tsx',
            '.cts': 'ts',
            '.json': 'json',
            // React Native / Expo never consume raw CSS on native — `*.module.css`
            // (e.g. `@expo/log-box` overlays, pulled in by the Dev Client error
            // overlay) is imported as a JS module of class-name strings, and
            // plain `*.css` is discarded. Tell rolldown to treat CSS as JS so
            // `rollipop:css-module-transform` can emit the interop module instead
            // of rolldown's (removed) native CSS pipeline erroring out.
            '.css': 'js',
            '.module.css': 'js',
          },
        }
      : {}),
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
      cssModule(),
      devServer(devServerPluginOptions),
      reporter(reporterPluginOptions),
      analyze(analyzePluginOptions),
      expoMetroRuntimePlugin(),
      expoRouter(expoRouterPluginOptions),
      expoAssetInterop(expoAssetInteropPluginOptions),
      selfRefDefaultInteropPlugin(),
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
        context.eventBus.emit({ type: 'build_error', level, log: diagnostic });
      } else if (isPluginLog(log)) {
        context.eventBus.emit({ type: 'build_log', level, log: diagnostic });
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
    ? getOverrideOptionsForDevServer(buildOptions, hmrEnabled, reactRefreshFilter)
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

function resolveEntryPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
): EntryPluginOptions {
  return {
    id: context.id,
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

  // Deduplicate `react` to a single module instance across the whole graph.
  // React's package splits into several subpath entry files (`react`,
  // `react/jsx-runtime`, `react/jsx-dev-runtime`, plus dev/prod CJS variants)
  // that each define their own `ReactSharedInternals` (the hook dispatcher
  // host). Without dedupe, rollipop bundles each as a separate module, so
  // react-native's renderer sets the dispatcher on one instance while app
  // components read another (null) -> "Invalid hook call" / "Cannot read
  // property 'use' of null". Metro resolves every `react*` specifier to the
  // same package instance; we mirror that here by aliasing `react` and its
  // subpaths to the resolved project `react` package, which also catches the
  // symlinked `expo` fork's nested `react` copy (a separate pnpm store) that
  // would otherwise be a distinct instance and break hooks at runtime.
  const reactRoot = path.dirname(resolveFrom(config.root, 'react'));
  const reactNativeRoot = path.dirname(resolveFrom(config.root, 'react-native'));

  const reactDedupeAlias: Record<string, string> = {
    react: `${reactRoot}/index.js`,
    'react/jsx-runtime': `${reactRoot}/jsx-runtime.js`,
    'react/jsx-dev-runtime': `${reactRoot}/jsx-dev-runtime.js`,
    'react-native': `${reactNativeRoot}/index.js`,
  };

  if (Array.isArray(alias)) {
    // `@rollipop/rolldown` only accepts the object/glob form of `resolve.alias`
    // (`Record<string, string | string[] | false>`); the array form with
    // `AliasEntry` (which may carry `RegExp` finds) is not representable. Route
    // any string-find entries through the `vite-alias` plugin (which chains to
    // plugin `resolveId` hooks, so virtual-id replacements resolve correctly)
    // instead of the object form — rolldown's core object alias does NOT re-invoke
    // `resolveId` for the replacement, so a virtual-id replacement would fail to
    // resolve. Drop RegExp/exotic finds with a warning since the vite-alias
    // plugin only accepts string or RegExp `find` and we cannot safely convert
    // arbitrary exotic finds.
    const aliasPluginEntries: { find: string; replacement: string }[] = [];
    for (const entry of alias) {
      const find = (entry as { find?: unknown }).find;
      const replacement = (entry as { replacement?: unknown }).replacement;
      if (typeof find === 'string' && typeof replacement === 'string') {
        aliasPluginEntries.push({ find, replacement });
      } else {
        console.warn(
          `[rollipop] dropping unsupported alias entry (non-string find is not representable in the vite-alias plugin): ${String(find)}`,
        );
      }
    }
    return {
      rolldownAlias: { ...reactDedupeAlias },
      aliasPluginOptions: { entries: aliasPluginEntries },
    };
  }

  return {
    rolldownAlias: { ...alias, ...reactDedupeAlias },
    aliasPluginOptions: { entries: [] },
  };
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

export function resolveWorkletsConfig(
  config: ResolvedConfig,
): RollipopReactNativeWorkletsConfig | undefined {
  const { worklets } = config.experimental ?? {};

  // Auto-enable worklets when the project depends on `react-native-worklets`
  // (the engine `react-native-reanimated` v4 is built on). Without this,
  // reanimated v4 never initializes its runtime — including the
  // `ScrollView.scrollTo` patch — which throws
  // `ReferenceError: Property 'scrollTo' doesn't exist` on RN 0.86 (new arch)
  // at first render. `babel-preset-expo` enables the equivalent automatically;
  // Rollipop must do the same so apps don't have to opt in manually.
  if (worklets == null) {
    const workletsPkg = resolvePackageJson(config.root, 'react-native-worklets');
    if (workletsPkg == null) {
      return undefined;
    }
    return {
      isRelease: config.mode === 'production',
      pluginVersion: workletsPkg.version,
    };
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
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
  hmrConfig: ReturnType<typeof resolveHmrConfig>,
  reactRefreshFilter: ReactRefreshFilter,
  devEngineOptions: DevEngineOptions | undefined,
): DevServerPluginOptions {
  return {
    cwd: config.root,
    id: context.id,
    origin:
      devEngineOptions == null
        ? undefined
        : getBaseUrl(devEngineOptions.host, devEngineOptions.port, devEngineOptions.https),
    bundleEntry: devEngineOptions?.bundleEntry,
    platform: buildOptions.platform,
    hmrClientPath: config.reactNative.hmrClientPath,
    hmrConfig,
    reactRefreshFilter,
    sourceMapUrl: devEngineOptions?.sourceMapUrl,
  };
}

function resolveReporterPluginOptions(
  config: ResolvedConfig,
  context: BundlerContext,
  buildOptions: ResolvedBuildOptions,
): ReporterPluginOptions {
  const builtinReporters = [
    createBuildTotalModulesReporter(context),
    createStatusReporter(config, context, buildOptions),
  ];
  const reporters = [...builtinReporters, config.reporter].filter(isNotNil);

  for (const reporter of reporters) {
    context.eventBus.subscribe(createReporterEventListener(reporter));
  }

  return {
    initialTotalModules: getBuildTotalModules(context.storage, context.id),
    eventBus: context.eventBus,
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

function resolveExpoRouterPluginOptions(config: ResolvedConfig): ExpoRouterPluginOptions {
  return {
    enabled: isExpoBundlerMode(),
    projectRoot: config.root,
  };
}

function resolveExpoAssetInteropPluginOptions(): ExpoAssetInteropPluginOptions {
  return {
    enabled: isExpoBundlerMode(),
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
): Reporter | undefined {
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
  reactRefreshFilter: ReactRefreshFilter = {
    include: DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
    exclude: DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
  },
) {
  const overrideOptions = getOverrideOptions();

  const input: rolldown.InputOptions = {
    // Disable code splitting for the dev server so the entire module graph is
    // inlined into a single `index.bundle` (matching Metro's single-artifact
    // dev bundle). Without this, rollipop's dev engine emits a split graph with
    // external modules loaded lazily via `require.e`, which requires a dev-client
    // chunk bridge that the Expo dev client does not provide — causing
    // "External module ... is not available" at runtime.
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
                ...reactRefreshFilter,
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
    // Inline all modules (including dynamic/external imports) into a single
    // `index.bundle`, matching Metro's single-artifact dev bundle. Without this,
    // rollipop externalizes modules and emits `require.e(id)` calls that require a
    // dev-client chunk bridge (absent in the Expo dev client), leaving those
    // modules undefined at runtime.
    inlineDynamicImports: true,
    // Disable code splitting so the entire module graph is inlined into a single
    // `index.bundle` (see the dev-server input rationale above). `codeSplitting`
    // is an output-level option in Rolldown.
    codeSplitting: false,
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

function resolveReactRefreshFilter(transformOptions: RolldownTransformOptions): ReactRefreshFilter {
  const jsx = transformOptions.jsx as RolldownJsxOptions | undefined;
  const refresh = jsx?.refresh != null && typeof jsx.refresh === 'object' ? jsx.refresh : undefined;

  return {
    include:
      normalizeReactRefreshPatterns(refresh?.include) ?? DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
    exclude:
      normalizeReactRefreshPatterns(refresh?.exclude) ?? DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
  };
}

function normalizeReactRefreshPatterns(
  patterns: RolldownReactRefreshOptions['include'],
): ReactRefreshFilter['include'] {
  if (patterns == null) {
    return undefined;
  }
  return Array.isArray(patterns) ? patterns : [patterns];
}

export type RolldownOptionsFunction = (
  options: RolldownOptions,
  context: RolldownOptionsContext,
) => MaybePromise<RolldownOptions>;

export type RolldownOptionsConfig = RolldownOptions | RolldownOptionsFunction;

export type RolldownOptionsContext = Readonly<
  ResolvedBuildOptions & Pick<BundlerContext, 'id' | 'root' | 'buildType'>
>;
