import type * as rolldown from '@rollipop/rolldown';
import type { DevEngine as BaseDevEngine, DevOptions } from '@rollipop/rolldown/experimental';

import type { EventBus } from '../events/event-bus';
import type { FileStorage } from '../storage/file-storage';
import { ResolvedBuildOptions } from '../utils/build-options';
import type { RolldownOptions } from './rolldown';

export interface BuildOptions {
  /**
   * The platform to build for.
   */
  platform: string;
  /**
   * Whether to build in development mode.
   *
   * Defaults to `config.mode === 'development'`.
   */
  dev?: boolean;
  /**
   * Whether to minify the bundle.
   *
   * This option is overridden by the `minify` option in the config.
   *
   * Defaults to `false`.
   */
  minify?: rolldown.OutputOptions['minify'];
  /**
   * Enable or disable the cache.
   *
   * Defaults to `true`.
   */
  cache?: boolean;
  /**
   * The output file.
   */
  outfile?: string;
  /**
   * The sourcemap file.
   *
   * This option is overridden by the `sourcemap` option in the config.
   */
  sourcemap?: rolldown.OutputOptions['sourcemap'];
  /**
   * The output file for the sourcemap.
   */
  sourcemapOutfile?: string;
  /**
   * The assets directory.
   */
  assetsDir?: string;
}

export type DevEngine = BaseDevEngine & {
  getContext: () => BundlerContext;
  buildOptions: ResolvedBuildOptions;
  rolldownOptions: RolldownOptions;
};

export type DevEngineOptions = Omit<DevOptions, 'watch'> & {
  /**
   * The host to run the dev server on.
   */
  host: string;
  /**
   * The port to run the dev server on.
   */
  port: number;
  /**
   * Whether to use HTTPS.
   *
   * Defaults to `false`.
   */
  https?: boolean;
  /**
   * Dev-server URL that should be written into the bundle's sourceMappingURL comment.
   */
  sourceMapUrl?: string;
};

export interface BundlerContext {
  id: string;
  root: string;
  storage: FileStorage;
  eventBus: EventBus;
  buildType: BuildType;
  state: BundlerState;
}

export interface BundlerState {
  revision: number;
  latestBuildStartTime: number;
}

export type BuildType = 'build' | 'serve';

export type AsyncResult<T> = T | Promise<T>;
