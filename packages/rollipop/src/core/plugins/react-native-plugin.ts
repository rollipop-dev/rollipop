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
    platform,
    preferNativePlatform,
    buildType,
    context,
    assetsDir,
    assetExtensions,
    assetRegistryPath,
    builtinPluginConfig,
  } = options;

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

  return [rollipopReactNativePlugin(builtinPluginConfig), assetPlugin];
}

export { reactNativePlugin as reactNative };
