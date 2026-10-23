import fs from 'node:fs';
import path from 'node:path';

import type { Plugin, PluginFlattenConfig, ResolvedConfig } from 'rollipop';

import createCompatPlugins, { createExpoLogBoxPlugin } from './compat';
import type { ExpoCompatibility } from './compatibility';
import { resolveRuntimeTarget } from './compatibility/runtime';
import { createExpoAssetPlugin } from './export';
import hmrRuntime from './hmr';
import { createRouterPlugin, getRouterRoot } from './router';
import { createExpoServicesPlugin } from './services';
import type { AppConfig, BuildMode, RollipopAPI } from './types';
import createWorkletsConfig from './worklets';

const warned = new Set();

export default async function makeConfig(
  api: RollipopAPI,
  compatibility: ExpoCompatibility,
  mode: BuildMode,
  exp: AppConfig,
  devServerOrigin?: string,
): Promise<ResolvedConfig> {
  const { projectRoot, expoRequire } = compatibility;
  const { resolveEntryPoint } = expoRequire('@expo/config/paths');
  const configFile = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json']
    .map((extension) => path.join(projectRoot, `rollipop.config.${extension}`))
    .find((file) => fs.existsSync(file));
  const defaults = configFile
    ? await api.loadConfig({ cwd: projectRoot, configFile, mode })
    : await api.getDefaultConfig(projectRoot, mode);
  if (!warned.has(projectRoot)) {
    const customConfig = [
      'babel.config.js',
      'babel.config.cjs',
      'babel.config.mjs',
      'babel.config.json',
      '.babelrc',
      '.babelrc.js',
      '.babelrc.cjs',
      'metro.config.js',
      'metro.config.cjs',
      'metro.config.mjs',
    ].filter((file) => fs.existsSync(path.join(projectRoot, file)));
    if (customConfig.length)
      console.warn(
        `[@rollipop/expo] ${customConfig.join(', ')} is not executed. Expo defaults and Worklets are automatic; migrate custom transforms/resolvers to rollipop.config.ts.`,
      );
    warned.add(projectRoot);
  }
  const runtimeTarget = resolveRuntimeTarget(compatibility, exp);
  const compat = createCompatPlugins(compatibility, runtimeTarget);
  const router = createRouterPlugin(projectRoot, getRouterRoot(compatibility, exp));
  const entry = resolveEntryPoint(projectRoot);
  const assetRegistryPath =
    typeof defaults.reactNative.assetRegistryPath === 'function'
      ? await defaults.reactNative.assetRegistryPath(projectRoot)
      : defaults.reactNative.assetRegistryPath;
  const overrides = {
    configFile: configFile ?? path.join(projectRoot, 'app.json'),
    entry,
    runtimeTarget,
    // Keep environment values and the dev origin in resolved config so persistent-cache IDs change with them.
    transform: {
      define: {
        ...Object.fromEntries(
          Object.entries(process.env)
            .filter(([key]) => key.startsWith('EXPO_PUBLIC_'))
            .map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
        ),
        ...(devServerOrigin
          ? { 'process.env.EXPO_DEV_SERVER_ORIGIN': JSON.stringify(devServerOrigin) }
          : {}),
      },
    },
    dev: { hmr: { runtimeImplement: hmrRuntime } },
    plugins: [...compat, ...(router ? [router] : []), createExpoServicesPlugin(compatibility)],
    rolldownOptions(options, { platform, buildType }) {
      if (!['ios', 'android'].includes(platform)) {
        throw new Error('@rollipop/expo supports iOS and Android only');
      }
      // Rollipop normalizes these fields before invoking configuration hooks.
      Object.assign(options.input!.transform!.define!, {
        'process.env.EXPO_OS': JSON.stringify(platform),
        'process.env.EXPO_SERVER': 'false',
        'process.env.EXPO_BASE_URL': '""',
      });
      (options.input!.plugins as Plugin[]).unshift(
        createExpoLogBoxPlugin(api, platform),
        createExpoAssetPlugin({
          api,
          projectRoot,
          platform,
          assetExtensions: defaults.resolve.assetExtensions,
          assetRegistryPath,
          isNativeExport: buildType === 'build',
        }),
      );
      return options;
    },
  } satisfies PluginFlattenConfig & Pick<ResolvedConfig, 'configFile'>;

  return api.mergeConfig(
    defaults,
    ...compat.map((plugin) => plugin.config ?? {}),
    router?.config ?? {},
    createWorkletsConfig(projectRoot),
    exp.experiments?.reactCompiler
      ? {
          transform: {
            jsx: {
              compiler: {
                customOptOutDirectives: ['use no memo', 'use no forget', 'worklet', 'widget'],
              },
            },
          },
        }
      : {},
    overrides,
  ) as ResolvedConfig;
}
