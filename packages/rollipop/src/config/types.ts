import type * as babel from '@babel/core';
import type * as rolldown from '@rollipop/rolldown';
import type {
  DevWatchOptions,
  RollipopReactNativeFlowConfig,
  RollipopReactNativeWorkletsConfig,
} from '@rollipop/rolldown/experimental';
import type { TopLevelFilterExpression } from '@rollipop/rolldown/filter';
import type * as swc from '@swc/core';

export type { RollipopReactNativeFlowConfig, RollipopReactNativeWorkletsConfig };

import type { AliasEntry } from '../core/plugins';
import type { Plugin } from '../core/plugins/types';
import type { InteractiveCommand } from '../node/cli-utils';
import type { MaybePromise, NullValue, Reporter } from '../types';

type RolldownExperimentalOptions = NonNullable<rolldown.InputOptions['experimental']>;
type RolldownTransformOptions = NonNullable<rolldown.InputOptions['transform']>;
type ReactCompilerTransformOptions = RolldownTransformOptions['reactCompiler'];
type RollipopManagedInputOption =
  | 'input'
  | 'plugins'
  | 'cwd'
  | 'platform'
  | 'checks'
  | 'logLevel'
  | 'onLog'
  | 'onwarn'
  | 'resolve'
  | 'transform'
  | 'watch'
  | 'experimental'
  | 'id';
type RollipopManagedOutputOption = 'dir' | 'file' | 'format' | 'codeSplitting' | 'persistentCache';

export interface Config extends Omit<rolldown.InputOptions, RollipopManagedInputOption> {
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
  resolve?: ResolveConfig;
  /**
   * Transformer configuration.
   */
  transform?: TransformConfig;
  /**
   * Prelude modules imported before the app entry module.
   */
  prelude?: string[];
  /**
   * Polyfills injected before the app modules run.
   */
  polyfills?: Polyfill[];
  /**
   * Output configuration.
   */
  output?: OutputConfig;
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
  dev?: DevConfig;
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
   * Raw Rolldown options merged before Rollipop's generated options.
   *
   * Use this for Rolldown options that Rollipop does not expose directly.
   * Rollipop-managed options can still be overwritten by the generated config.
   */
  rolldownOptions?: RawRolldownOptions;
  /**
   * Rollipop provides default options for Rolldown, but you can override the final
   * generated options with this hook.
   *
   * **DANGEROUS**: This option is dangerous because it can break the build.
   */
  dangerously_overrideRolldownOptions?: (config: RolldownConfig) => MaybePromise<RolldownConfig>;
}

export type PluginOption = MaybePromise<
  | NullValue<Plugin>
  | {
      name: string;
    }
  | false
  | PluginOption[]
>;

export type ResolveConfig = Omit<
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
};

export type AliasConfig = NonNullable<rolldown.InputOptions['resolve']>['alias'] | AliasEntry[];

export type TransformConfig = Omit<
  RolldownTransformOptions,
  'cwd' | 'lang' | 'sourceType' | 'plugins'
> & {
  /**
   * React Compiler transformation configuration.
   */
  reactCompiler?: ReactCompilerTransformOptions;
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

export interface ExperimentalConfig extends RolldownExperimentalOptions {
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

export interface OutputConfig extends Omit<rolldown.OutputOptions, RollipopManagedOutputOption> {}

export type Polyfill = string | PolyfillWithCode | PolyfillWithPath;
export type PolyfillOptions = { withTransform?: boolean };
export type PolyfillWithCode = { type: PolyfillType; code: string } & PolyfillOptions;
export type PolyfillWithPath = { type: PolyfillType; path: string } & PolyfillOptions;
export type PolyfillType = 'plain' | 'iife';

export type OptimizationConfig = rolldown.OptimizationOptions;

export type WatcherConfig = DevWatchOptions;

export interface DevConfig {
  /**
   * Watcher configuration.
   */
  watch?: WatcherConfig;
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

export interface RawRolldownOptions extends rolldown.InputOptions {
  output?: rolldown.OutputOptions;
}

export interface RolldownConfig {
  input?: rolldown.InputOptions;
  output?: rolldown.OutputOptions;
}
