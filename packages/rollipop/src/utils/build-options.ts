import path from 'node:path';

import { cloneDeep, toMerged } from 'es-toolkit';

import type { ResolvedConfig } from '../config';
import type { BuildOptions } from '../core/types';

const DEFAULT_BUILD_OPTIONS: Partial<BuildOptions> = {
  cache: true,
  minify: false,
};

export function resolveBuildOptions(config: ResolvedConfig, buildOptions: BuildOptions) {
  const resolvedBuildOptions = cloneDeep(buildOptions);

  if (resolvedBuildOptions.outfile) {
    resolvedBuildOptions.outfile = path.resolve(config.root, resolvedBuildOptions.outfile);
  }

  if (
    (resolvedBuildOptions.sourcemap === true || resolvedBuildOptions.sourcemap === 'hidden') &&
    resolvedBuildOptions.sourcemapOutfile
  ) {
    resolvedBuildOptions.sourcemapOutfile = path.resolve(
      config.root,
      resolvedBuildOptions.sourcemapOutfile,
    );
  }

  return toMerged(DEFAULT_BUILD_OPTIONS, {
    ...resolvedBuildOptions,
    dev: resolvedBuildOptions.dev ?? config.mode === 'development',
  });
}

export type ResolvedBuildOptions = ReturnType<typeof resolveBuildOptions>;
