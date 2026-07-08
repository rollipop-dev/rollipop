import fs from 'node:fs';
import path from 'node:path';

import * as rolldown from '@rollipop/rolldown';
import { dev } from '@rollipop/rolldown/experimental';
import { invariant, merge } from 'es-toolkit';

import { Logo } from '../common/logo';
import type { ResolvedConfig } from '../config/defaults';
import { FileStorage } from '../storage/file-storage';
import { resolveBuildOptions, type ResolvedBuildOptions } from '../utils/build-options';
import { createId } from '../utils/id';
import {
  getOverrideOptions,
  getOverrideOptionsForDevServer,
  resolveRolldownOptions,
} from './rolldown';
import type { BuildType, BuildOptions, BundlerContext, DevEngine, DevEngineOptions } from './types';
import { BundlerState } from './types';

export class Bundler {
  static async devEngine(
    config: ResolvedConfig,
    buildOptions: Omit<BuildOptions, 'dev' | 'outfile'>,
    devEngineOptions: DevEngineOptions,
  ) {
    const buildType = 'serve';
    const resolvedBuildOptions = resolveBuildOptions(config, buildOptions);
    const context = Bundler.createContext(buildType, config, resolvedBuildOptions);
    const { input = {}, output = {} } = await resolveRolldownOptions(
      context,
      config,
      resolvedBuildOptions,
      devEngineOptions,
    );

    const hmrEnabled = config.mode === 'development' && config.dev.hmr !== false;
    const devServerOptions = getOverrideOptionsForDevServer(resolvedBuildOptions, hmrEnabled);
    const mergedInput = merge(input, devServerOptions.input);
    const mergedOutput = merge(output, devServerOptions.output);

    const devEngine = await dev(mergedInput, mergedOutput, {
      watch: config.dev.watch,
      ...devEngineOptions,
    });

    Object.defineProperty(devEngine, 'getContext', {
      value: () => context,
      enumerable: true,
      configurable: false,
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
    const state: BundlerState = { revision: 0, latestBuildStartTime: 0 };
    const context: BundlerContext = { id, root, storage, buildType, state };

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

    const overrideOptions = getOverrideOptions();
    const mergedInput = merge(input, overrideOptions.input);
    const mergedOutput = merge(output, overrideOptions.output);

    const rolldownBuildOptions: rolldown.BuildOptions = {
      ...mergedInput,
      output: {
        ...mergedOutput,
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
