import fs from 'node:fs';
import path from 'node:path';

import * as rolldown from '@rollipop/rolldown';
import { dev } from '@rollipop/rolldown/experimental';
import { invariant } from 'es-toolkit';

import { Logo } from '../common/logo';
import type { ResolvedConfig } from '../config/defaults';
import { EventBus } from '../events/event-bus';
import { FileStorage } from '../storage/file-storage';
import { resolveBuildOptions, type ResolvedBuildOptions } from '../utils/build-options';
import { createId } from '../utils/id';
import { resolveRolldownOptions } from './rolldown';
import type { BuildType, BuildOptions, BundlerContext, DevEngine, DevEngineOptions } from './types';
import { BundlerState } from './types';

export class Bundler {
  static async devEngine(
    config: ResolvedConfig,
    buildOptions: Omit<BuildOptions, 'dev' | 'outfile'>,
    devEngineOptions: DevEngineOptions,
  ): Promise<DevEngine> {
    const buildType = 'serve';
    const resolvedBuildOptions = resolveBuildOptions(config, buildOptions);
    const context = Bundler.createContext(buildType, config, resolvedBuildOptions);
    const rolldownOptions = await resolveRolldownOptions(
      context,
      config,
      resolvedBuildOptions,
      devEngineOptions,
    );
    const { input = {}, output = {} } = rolldownOptions;

    const devEngine = await dev(input, output, {
      watch: config.dev.watch,
      ...devEngineOptions,
    });

    Object.defineProperties(devEngine, {
      getContext: {
        value: () => context,
        enumerable: true,
        configurable: false,
      },
      buildOptions: {
        get: () => resolvedBuildOptions,
        enumerable: true,
        configurable: false,
      },
      rolldownOptions: {
        get: () => rolldownOptions,
        enumerable: true,
        configurable: false,
      },
    });

    return devEngine as DevEngine;
  }

  static createId(config: ResolvedConfig, buildOptions: ResolvedBuildOptions) {
    return createId(config, resolveBuildOptions(config, buildOptions));
  }

  private static createContext(
    buildType: BuildType,
    config: ResolvedConfig,
    buildOptions: ResolvedBuildOptions,
  ) {
    const id = Bundler.createId(config, buildOptions);
    const root = config.root;
    const storage = FileStorage.getInstance(config.root);
    const eventBus = new EventBus();
    const state: BundlerState = { revision: 0, latestBuildStartTime: 0 };
    const context: BundlerContext = { id, root, storage, eventBus, buildType, state };

    return context;
  }

  constructor(private readonly config: ResolvedConfig) {
    Logo.printOnce();
  }

  async build(buildOptions: BuildOptions) {
    const buildType = 'build';
    const resolvedBuildOptions = resolveBuildOptions(this.config, buildOptions);
    const context = Bundler.createContext(buildType, this.config, resolvedBuildOptions);
    const sourcemap = resolvedBuildOptions.sourcemap ? true : false;
    const { input = {}, output = {} } = await resolveRolldownOptions(
      context,
      this.config,
      resolvedBuildOptions,
    );

    const rolldownBuildOptions: rolldown.BuildOptions = {
      ...input,
      output: {
        ...output,
        sourcemap,
      },
      write: Boolean(resolvedBuildOptions.outfile),
    };

    const buildResult = await rolldown.build(rolldownBuildOptions);
    const chunk = buildResult.output[0];
    invariant(chunk, 'Bundled chunk is not found');

    if (
      resolvedBuildOptions.outfile &&
      chunk.sourcemapFileName &&
      resolvedBuildOptions.sourcemapOutfile
    ) {
      const outputDir = path.dirname(resolvedBuildOptions.outfile);
      const sourcemapDir = path.dirname(resolvedBuildOptions.sourcemapOutfile);
      const sourcemapFile = path.join(outputDir, chunk.sourcemapFileName);
      if (!fs.existsSync(sourcemapDir)) {
        fs.mkdirSync(sourcemapDir, { recursive: true });
      }
      fs.renameSync(sourcemapFile, resolvedBuildOptions.sourcemapOutfile);
    }

    return chunk;
  }
}
