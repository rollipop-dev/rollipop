import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import {
  rollipopReactNativePlugin,
  type RollipopReactNativePluginConfig,
} from '@rollipop/rolldown/experimental';
import { id, include } from '@rollipop/rolldown/filter';

import {
  AssetData,
  copyAssetsToDestination,
  generateAssetRegistryCode,
  resolveScaledAssets,
} from '../assets';
import type { BuildType, BundlerContext } from '../types';
import { TransformFlag, setFlag } from './utils/transform-utils';

export interface ReactNativePluginOptions {
  context: BundlerContext;
  projectRoot: string;
  reactNativePath: string;
  platform: string;
  preferNativePlatform: boolean;
  buildType: BuildType;
  assetsDir?: string;
  assetExtensions: string[];
  assetRegistryPath: string;
  /** @internal builtin plugin config */
  builtinPluginConfig: RollipopReactNativePluginConfig;
}

function reactNativePlugin(options: ReactNativePluginOptions): rolldown.Plugin[] {
  const {
    projectRoot,
    reactNativePath,
    platform,
    preferNativePlatform,
    buildType,
    context,
    assetsDir,
    assetExtensions,
    assetRegistryPath,
    builtinPluginConfig,
  } = options;

  const privateModulePrefix = 'react-native/src/private/';
  const resolvedReactNativePath = path.resolve(reactNativePath);
  const privateModulePlugin: rolldown.Plugin = {
    name: 'rollipop:react-native-private-module',
    resolveId: {
      order: 'post',
      filter: [include(id(/^react-native\/src\/private\//))],
      handler(source, importer, extraOptions) {
        if (!source.startsWith(privateModulePrefix)) {
          return null;
        }

        const candidate = path.resolve(
          resolvedReactNativePath,
          source.slice('react-native/'.length),
        );
        const relativeCandidate = path.relative(resolvedReactNativePath, candidate);
        if (relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) {
          return null;
        }

        return this.resolve(candidate, importer, { ...extraOptions, skipSelf: true });
      },
    },
  };

  const assets: AssetData[] = [];
  const assetPlugin: rolldown.Plugin = {
    name: 'rollipop:react-native-asset',
    load: {
      filter: [include(id(new RegExp(`\\.(?:${assetExtensions.join('|')})$`)))],
      async handler(id) {
        this.debug(`Asset ${id} found`);

        const assetData = await resolveScaledAssets({
          projectRoot,
          assetPath: id,
          platform,
          preferNativePlatform,
        });

        assets.push(assetData);

        return {
          code: generateAssetRegistryCode(assetRegistryPath, assetData),
          meta: setFlag.call(this, context, id, TransformFlag.SKIP_ALL),
          moduleType: 'js',
        };
      },
    },
    buildStart() {
      assets.length = 0;
    },
    async buildEnd(error) {
      if (error || buildType === 'serve') {
        return;
      }

      if (assetsDir != null) {
        this.debug(`Copying assets to ${assetsDir}`);
        await copyAssetsToDestination({
          assets,
          assetsDir,
          platform,
          preferNativePlatform,
        });
      }
    },
  };

  return [privateModulePlugin, rollipopReactNativePlugin(builtinPluginConfig), assetPlugin];
}

export { reactNativePlugin as reactNative };
