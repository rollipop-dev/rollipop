import path from 'node:path';

import { cloneDeep, toMerged } from 'es-toolkit';

import type { ResolvedConfig } from '../config';
import type { BuildOptions } from '../core/types';

const DEFAULT_BUILD_OPTIONS: Partial<BuildOptions> = {
  cache: true,
};

export function resolveBuildOptions(config: ResolvedConfig, buildOptions: BuildOptions) {
  const resolvedBuildOptions: BuildOptions = cloneDeep({
    ...buildOptions,
    minify: buildOptions.minify ?? config.output.minify ?? false,
    sourcemap: buildOptions.sourcemap ?? config.output.sourcemap,
  });

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
