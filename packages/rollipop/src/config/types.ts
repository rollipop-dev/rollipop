import type * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import type {
  DevWatchOptions,
  RollipopReactNativeFlowConfig,
  RollipopReactNativeWorkletsConfig,
} from '@rollipop/rolldown/experimental';
import type { TopLevelFilterExpression } from '@rollipop/rolldown/filter';
import type { TransformOptions } from '@rollipop/rolldown/utils';
import type * as swc from '@swc/core';

export type { RollipopReactNativeFlowConfig, RollipopReactNativeWorkletsConfig };

import type { AliasEntry } from '../core/plugins';
import type { Plugin } from '../core/plugins/types';
import type { InteractiveCommand } from '../node/cli-utils';
import type { MaybePromise, NullValue, Reporter } from '../types';

type RolldownExperimentalOptions = NonNullable<rolldown.InputOptions['experimental']>;

export interface Config {
  /**
   * Defaults to current working directory.
   */
  root?: string;
  /**
   * Specifying this in config will override the default mode for both serve and build.
   *
   * Defaults to: `'development'` for serve, 'production' for build.
   */
  mode?: 'development' | 'production';
  /**
   * Defaults to: `index.js`
   */
  entry?: string;
  /**
   * Resolver configuration.
   */
  resolver?: ResolverConfig;
  /**
   * Transformer configuration.
   */
  transformer?: TransformerConfig;
  /**
   * Serializer configuration.
   */
  serializer?: SerializerConfig;
  /**
   * Watcher configuration.
   */
  watcher?: WatcherConfig;
  /**
   * Optimization configuration.
   */
  optimization?: OptimizationConfig;
  /**
   * React Native specific configuration.
   */
  reactNative?: ReactNativeConfig;
  /**
   * Terminal configuration.
   */
  terminal?: TerminalConfig;
  /**
   * Reporter configuration.
   */
  reporter?: Reporter;
  /**
   * Bundle analyzer configuration.
   */
  analyzer?: AnalyzerConfig;
  /**
   * Dev mode specific configuration. (for dev server)
   */
  devMode?: DevModeConfig;
  /**
   * Directory to load environment variables from.
   *
   * Defaults to: `root`
   */
  envDir?: string;
  /**
   * Base name for environment files.
   *
   * Acts as the basename of the standard four-file resolution: the loader looks
   * for `${envFile}`, `${envFile}.local`, `${envFile}.[mode]`, and
   * `${envFile}.[mode].local`. Override this to use a custom name such as
   * `.rollipop-env` instead of the default `.env`.
   *
   * Expects a file name (not a path).
   *
   * Defaults to: `'.env'`
   */
  envFile?: string;
  /**
   * Environment variable prefix.
   *
   * Defaults to: `'ROLLIPOP_'`
   */
  envPrefix?: string;
  /**
   * Configures TypeScript configuration file resolution and usage.
   *
   * Defaults to: `true`
   */
  tsconfig?: rolldown.InputOptions['tsconfig'];
  /**
   * Whether to generate sourcemaps.
   *
   * - `false`: No sourcemap will be generated.
   * - `true`: A separate sourcemap file will be generated.
   * - `'inline'`: The sourcemap will be appended to the output file as a data URL.
   * - `'hidden'`: A separate sourcemap file will be generated, but the link to the sourcemap (//# sourceMappingURL comment) will not be included in the output file.
   *
   * Defaults to: `true` when in development mode, `false` otherwise.
   */
  sourcemap?: rolldown.OutputOptions['sourcemap'];
  /**
   * The base URL for the links to the sourcemap file in the output file.
   *
   * By default, relative URLs are generated. If this option is set, an absolute URL with that base URL will be generated.
   * This is useful when deploying source maps to a different location than your code, such as a CDN or separate debugging server.
   */
  sourcemapBaseUrl?: rolldown.OutputOptions['sourcemapBaseUrl'];
  /**
   * Whether to include [debug IDs](https://github.com/tc39/ecma426/blob/main/proposals/debug-id.md) in the sourcemap.
   *
   * When `true`, a unique debug ID will be emitted in source and sourcemaps which streamlines identifying sourcemaps across different builds.
   *
   * Defaults to: `false`
   */
  sourcemapDebugIds?: rolldown.OutputOptions['sourcemapDebugIds'];
  /**
   * Control which source files are included in the sourcemap ignore list.
   *
   * Files in the ignore list are excluded from debugger stepping and error stack traces.
   *
   * - `false`: Include no source files in the ignore list
   * - `true`: Include all source files in the ignore list
   * - `string`: Files containing this string in their path will be included in the ignore list
   * - `RegExp`: Files matching this regular expression will be included in the ignore list
   * - `function`: Custom function to determine if a source should be ignored
   *
   * :::tip Performance
   * Using static values (`boolean`, `string`, or `RegExp`) is significantly more performant than functions.
   * Calling JavaScript functions from Rust has extremely high overhead, so prefer static patterns when possible.
   * :::
   *
   * @example
   * ```js
   * // ✅ Preferred: Use RegExp for better performance
   * sourcemapIgnoreList: /node_modules/
   *
   * // ✅ Preferred: Use string pattern for better performance
   * sourcemapIgnoreList: "vendor"
   *
   * // ! Use sparingly: Function calls have high overhead
   * sourcemapIgnoreList: (source, sourcemapPath) => {
   *   return source.includes('node_modules') || source.includes('.min.');
   * }
   * ```
   *
   * Defaults to: `/node_modules/`
   */
  sourcemapIgnoreList?: rolldown.OutputOptions['sourcemapIgnoreList'];
  /**
   * A transformation to apply to each path in a sourcemap.
   *
   * @example
   * ```js
   * export default defineConfig({
   *   output: {
   *     sourcemap: true,
   *     sourcemapPathTransform: (source, sourcemapPath) => {
   *       // Remove 'src/' prefix from all source paths
   *       return source.replace(/^src\//, '');
   *     },
   *   },
   * });
   * ```
   */
  sourcemapPathTransform?: rolldown.OutputOptions['sourcemapPathTransform'];
  /**
   * Plugins to apply to the build.
   */
  plugins?: PluginOption;
  /**
   * Internal option to specify the runtime target.
   *
   * Defaults to 'hermes-v1'.
   */
  runtimeTarget?: 'hermes' | 'hermes-v1';
  /**
   * Experimental options. Behaviour and shape may change between releases
   * without a major version bump.
   */
  experimental?: ExperimentalConfig;
  /**
   * Rollipop provides default options for Rolldown, but you can override them by this option.
   *
   * **DANGEROUS**: This option is dangerous because it can break the build.
   */
  dangerously_overrideRolldownOptions?:
    | RolldownConfig
    | ((config: RolldownConfig) => RolldownConfig)
    | ((config: RolldownConfig) => Promise<RolldownConfig>);
}

export type PluginOption = MaybePromise<
  | NullValue<Plugin>
  | {
      name: string;
    }
  | false
  | PluginOption[]
>;

export type ResolverConfig = Omit<
  NonNullable<rolldown.InputOptions['resolve']>,
  'alias' | 'extensions'
> & {
  /**
   * Substitute one package or module path for another.
   *
   * Object aliases are forwarded to Rolldown's native `resolve.alias`.
   * Array aliases are installed through Rollipop's alias plugin so plugin
   * [`resolveId`](/reference/Interface.Plugin#resolveid) hooks can participate in resolving the replacement.
   *
   * @example
   * ```js
   * // Object alias
   * resolve: {
   *   alias: {
   *     '@': '/src',
   *     'utils': './src/utils',
   *   }
   * }
   *
   * // Array alias
   * resolve: {
   *   alias: [
   *     { find: '@', replacement: '/src' },
   *     { find: /^utils\//, replacement: './src/utils/' },
   *   ]
   * }
   * ```
   *
   * > [!WARNING]
   * > Object aliases use `resolve.alias`, which will not call `resolveId` hooks of other plugins.
   * > Use the array form when plugin-based resolution is required.
   */
  alias?: AliasConfig;
  /**
   * Defaults to: `['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json']`
   */
  sourceExtensions?: string[];
  /**
   * Defaults to images (`bmp`, `gif`, `jpg`, `jpeg`, `png`, `psd`, `svg`, `webp`, `xml`),
   * video (`m4v`, `mov`, `mp4`, `mpeg`, `mpg`, `webm`), audio (`aac`, `aiff`, `caf`, `m4a`,
   * `mp3`, `wav`), documents (`html`, `pdf`, `yaml`, `yml`), fonts (`otf`, `ttf`), and
   * archives (`zip`).
   */
  assetExtensions?: string[];
  /**
   * If `true`, resolver will resolve `native` suffixed files.
   *
   * e.g.
   * - **true**: `index.android` -> `index.native` -> `index`
   * - **false**: `index.android` -> `index`
   *
   * Defaults to: `true`
   */
  preferNativePlatform?: boolean;
  /**
   * Specifies which modules should be treated as external and not bundled.
   *
   * External modules will be left as import statements in the output.
   */
  external?: rolldown.InputOptions['external'];
};

export type AliasConfig = NonNullable<rolldown.InputOptions['resolve']>['alias'] | AliasEntry[];

export type TransformerConfig = Omit<
  TransformOptions,
  'cwd' | 'lang' | 'sourceType' | 'plugins'
> & {
  /**
   * Flow specific configuration.
   *
   * Only applied when `experimental.nativeTransformPipeline` is **disabled** (the
   * default). With the native pipeline enabled, the rust-side plugin
   * handles Flow stripping internally.
   */
  flow?: FlowConfig;
  /**
   * Babel transformation configuration.
   */
  babel?: BabelTransformConfig;
  /**
   * SWC transformation configuration.
   */
  swc?: SwcTransformConfig;
};

export type BabelTransformConfig = { rules?: TransformRule<babel.TransformOptions>[] };
export type SwcTransformConfig = { rules?: TransformRule<swc.Options>[] };

export interface TransformRule<T = unknown> {
  filter?: rolldown.HookFilter | TopLevelFilterExpression[];
  options: T | ((code: string, id: string) => T);
}

export interface FlowConfig {
  /**
   * Filter for Flow transformation pipeline.
   */
  filter?: rolldown.HookFilter | TopLevelFilterExpression[];
}

export interface ExperimentalConfig {
  /**
   * Enables the native (rust) transform pipeline, which replaces the
   * legacy JS-side codegen marker, Flow strip, and SWC/babel preset
   * machinery with a single built-in `rollipopReactNativePlugin`.
   *
   * This is a breaking change for projects that customised the legacy
   * pipeline via `transformer.flow.filter`, `reactNative.codegen.filter`,
   * or `runtimeTarget`. Opt in once you have validated builds locally.
   *
   * Defaults to `false`.
   */
  nativeTransformPipeline?: boolean;
  /**
   * Flow handling configuration for the native transform pipeline.
   *
   * Only applied when `experimental.nativeTransformPipeline` is enabled.
   */
  flow?: RollipopReactNativeFlowConfig;
  /**
   * `react-native-worklets` transformation configuration.
   *
   * Only applied when `experimental.nativeTransformPipeline` is enabled.
   */
  worklets?: RollipopReactNativeWorkletsConfig;
}

export interface SerializerConfig {
  /**
   * Paths to prelude files.
   *
   * Prelude files are imported in the top of the entry module.
   */
  prelude?: string[];
  /**
   * Polyfills to include in the output bundle.
   *
   * Polyfills are injected in the top of the output bundle.
   */
  polyfills?: Polyfill[];
  /**
   * A string to prepend to the bundle before `renderChunk` hook.
   */
  banner?: rolldown.OutputOptions['banner'];
  /**
   * A string to append to the bundle before `renderChunk` hook.
   */
  footer?: rolldown.OutputOptions['footer'];
  /**
   * A string to prepend to the bundle after `renderChunk` hook and minification.
   */
  postBanner?: rolldown.OutputOptions['postBanner'];
  /**
   * A string to append to the bundle after `renderChunk` hook and minification.
   */
  postFooter?: rolldown.OutputOptions['postFooter'];
  /**
   * A string to prepend inside any format-specific wrapper.
   */
  intro?: rolldown.OutputOptions['intro'];
  /**
   * A string to append inside any format-specific wrapper.
   */
  outro?: rolldown.OutputOptions['outro'];
  /**
   * When `true`, creates shim variables for missing exports instead of throwing an error.
   *
   * Defaults to: `false`
   */
  shimMissingExports?: rolldown.InputOptions['shimMissingExports'];
}

export type Polyfill = string | PolyfillWithCode | PolyfillWithPath;
export type PolyfillOptions = { withTransform?: boolean };
export type PolyfillWithCode = { type: PolyfillType; code: string } & PolyfillOptions;
export type PolyfillWithPath = { type: PolyfillType; path: string } & PolyfillOptions;
export type PolyfillType = 'plain' | 'iife';

export type OptimizationConfig = rolldown.OptimizationOptions & {
  /**
   * Controls tree-shaking (dead code elimination).
   *
   * When `false`, tree-shaking will be disabled. When `true`, it is equivalent to setting each options to the default value.
   *
   * Defaults to: `true`
   */
  treeshake?: rolldown.InputOptions['treeshake'];
  /**
   * Control code minification.
   *
   * - `true`: Enable full minification including code compression and dead code elimination
   * - `false`: Disable minification (default)
   * - `'dce-only'`: Only perform dead code elimination without code compression
   * - `MinifyOptions`: Fine-grained control over minification settings
   *
   * Defaults to: `false`
   */
  minify?: rolldown.OutputOptions['minify'];
  /**
   * Control whether to enable lazy barrel optimization.
   *
   * Lazy barrel optimization avoids compiling unused re-export modules in side-effect-free barrel modules,
   * significantly improving build performance for large codebases with many barrel modules.
   *
   * Defaults to: `false`
   *
   * @see {@link https://rolldown.rs/in-depth/lazy-barrel-optimization | Lazy Barrel Documentation}
   */
  lazyBarrel?: RolldownExperimentalOptions['lazyBarrel'];
};

export type WatcherConfig = DevWatchOptions;

export interface DevModeConfig {
  /**
   * Hot Module Replacement configurations.
   * This feature is only available in `development` mode.
   *
   * Defaults to `true`.
   */
  hmr?: boolean | HmrConfig;
}

export interface HmrConfig {
  /**
   * Source code of the HMR runtime implementation.
   *
   * Defaults to: using `rollipop/hmr-runtime` as a default implementation.
   */
  runtimeImplement?: string;
  /**
   * Source code of the HMR client implementation.
   *
   * Defaults to: using `rollipop/hmr-client` as a default implementation.
   */
  clientImplement?: string;
}

export interface ReactNativeConfig {
  /**
   * Path to React Native package.
   *
   * Defaults to: resolving `react-native` package from `projectRoot`.
   */
  reactNativePath?: string;
  /**
   * Codegen specific configuration.
   *
   * Only applied when `experimental.nativeTransformPipeline` is **disabled** (the
   * default). With the native pipeline enabled, the rust-side plugin
   * handles codegen marking internally.
   */
  codegen?: CodegenConfig;
  /**
   * Path to asset registry file.
   *
   * Defaults to: `react-native/Libraries/Image/AssetRegistry.js`
   */
  assetRegistryPath?: string | ((root: string) => MaybePromise<string>);
  /**
   * Path to HMR client file.
   *
   * Defaults to: `react-native/Libraries/Utilities/HMRClient.js`
   */
  hmrClientPath?: string | ((root: string) => MaybePromise<string>);
}

export interface CodegenConfig {
  /**
   * Filter for codegen transformation pipeline.
   */
  filter?: rolldown.HookFilter | TopLevelFilterExpression[];
}

export interface AnalyzerConfig {
  /**
   * Whether to enable the bundle analyzer.
   *
   * Defaults to: `false`
   */
  enabled?: boolean;
  /**
   * Output filename for the analysis data.
   *
   * Defaults to: `analyze-data.json`
   */
  analyzeFile?: string;
  /**
   * Output filename for the generated HTML report.
   *
   * Defaults to: `report.html`
   */
  reportFile?: string;
  /**
   * Automatically open the generated report in the browser.
   * (Only available in `build` mode)
   *
   * Defaults to: `false`
   */
  autoOpen?: boolean;
}

export interface TerminalConfig {
  /**
   * Status of the terminal.
   *
   * Defaults to: `process.stderr.isTTY ? 'progress' : 'compat'`
   */
  status?: 'none' | 'compat' | 'progress';
  /**
   * Extra commands to display in the interactive mode.
   */
  extraCommands?: InteractiveCommand[];
}

export interface RolldownConfig {
  input?: rolldown.InputOptions;
  output?: rolldown.OutputOptions;
}
