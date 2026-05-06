/**
 * Module Federation plugin configuration.
 *
 * A single config takes one role at a time:
 *
 * - **Host** — declare `remotes`. The bundle consumes federated modules via `import('<remote>/<expose>')`,
 *   which the plugin rewrites to a runtime `loadRemote` call against the host's federation instance.
 * - **Remote** — declare `exposes`. The plugin emits an IIFE bundle whose container is registered on `globalThis`
 *   so the host can read it after the script is evaluated by the user-provided script loader.
 *
 * Defining both `remotes` and `exposes` in the same config throws.
 * Split into two configs and run them as separate Rollipop processes.
 */
export interface ModuleFederationConfig {
  /**
   * Federation name. Must be a non-empty string and stable across builds.
   */
  name: string;
  /**
   * Remotes consumed by this bundle (host role).
   *
   * The value is either the remote entry URL or an object form. Either way,
   * `entry` is the URL the user-provided script loader fetches at runtime.
   */
  remotes?: Record<string, string | ModuleFederationRemoteConfig>;
  /**
   * Modules exposed to other federated bundles (remote role).
   *
   * Each key is the public path (must start with `'./'`).
   * The value is the source file to expose, resolved relative to the project root.
   */
  exposes?: Record<string, string>;
  /**
   * Shared dependencies that the host owns and remotes consume from the shared registry.
   *
   * Use the array form for the simplest case (versions are read from `node_modules`).
   * The object form lets each entry tune `requiredVersion`, `singleton`, and `eager`.
   */
  shared?: string[] | Record<string, string | ModuleFederationSharedDependencyConfig>;
  /**
   * Share resolution strategy passed through to `@module-federation/runtime`.
   */
  shareStrategy?: 'version-first' | 'loaded-first';
  /**
   * Runtime configuration for the host bundle.
   *
   * `implement` is raw source that registers `globalThis.__rollipop_script_loader__` with a `ModuleFederationScriptLoader` implementation.
   * Injected as a polyfill so it runs before any module init.
   */
  runtime?: ModuleFederationRuntimeConfig;
}

export interface ModuleFederationRemoteConfig {
  name: string;
  entry: string;
  type?: 'var';
}

export interface ModuleFederationSharedDependencyConfig {
  requiredVersion?: string;
  singleton?: boolean;
  eager?: boolean;
}

export interface ModuleFederationRuntimeConfig {
  implement: string;
}

export interface NormalizedRemote {
  name: string;
  entry: string;
  type: 'var';
  entryGlobalName: string;
}

export interface NormalizedShared {
  version: string | undefined;
  requiredVersion: string | undefined;
  singleton: boolean;
  eager: boolean;
}

export interface NormalizedConfig {
  name: string;
  remotes: Record<string, NormalizedRemote>;
  exposes: Record<string, string>;
  shared: Record<string, NormalizedShared>;
  shareStrategy: 'version-first' | 'loaded-first';
  runtime: ModuleFederationRuntimeConfig | undefined;
  hasRemotes: boolean;
  hasExposes: boolean;
}
