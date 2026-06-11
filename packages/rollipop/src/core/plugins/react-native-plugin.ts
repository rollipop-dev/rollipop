import type * as rolldown from '@rollipop/rolldown';
import {
  rollipopReactNativePlugin,
  type RollipopReactNativePluginConfig,
} from '@rollipop/rolldown/experimental';
import { id, include, type TopLevelFilterExpression } from '@rollipop/rolldown/filter';

import { stripFlowTypes } from '../../common/transformer';
import {
  AssetData,
  copyAssetsToDestination,
  generateAssetRegistryCode,
  resolveScaledAssets,
} from '../assets';
import type { BuildType, BundlerContext } from '../types';
import { TransformFlag, getFlag, setFlag } from './utils/transform-utils';

export interface ReactNativePluginOptions {
  context: BundlerContext;
  projectRoot: string;
  platform: string;
  preferNativePlatform: boolean;
  buildType: BuildType;
  assetsDir?: string;
  assetExtensions: string[];
  assetRegistryPath: string;
  /**
   * Native pipeline configuration. When `null`, the legacy JS plugins
   * (codegen marker + Flow strip) are installed instead.
   *
   * @internal builtin plugin config
   */
  builtinPluginConfig: RollipopReactNativePluginConfig | null;
  /**
   * Filter for the legacy Flow-strip transform pipeline. Used when the
   * native pipeline is disabled.
   */
  flowFilter: rolldown.HookFilter | TopLevelFilterExpression[];
  /**
   * Filter for the legacy codegen marker pipeline. Used when the native
   * pipeline is disabled.
   */
  codegenFilter: rolldown.HookFilter | TopLevelFilterExpression[];
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
    flowFilter,
    codegenFilter,
    builtinPluginConfig,
  } = options;

  const codegenPlugin: rolldown.Plugin = {
    name: 'rollipop:react-native-codegen-marker',
    transform: {
      order: 'pre',
      filter: codegenFilter,
      handler(_code, id) {
        return { meta: setFlag.call(this, context, id, TransformFlag.CODEGEN_REQUIRED) };
      },
    },
  };

  const stripFlowSyntaxPlugin: rolldown.Plugin = {
    name: 'rollipop:react-native-strip-flow-syntax',
    transform: {
      order: 'pre',
      filter: flowFilter,
      async handler(code, id) {
        const flags = getFlag.call(this, context, id);

        if (flags & TransformFlag.SKIP_ALL) {
          return;
        }

        if (flags & TransformFlag.CODEGEN_REQUIRED) {
          return { meta: setFlag.call(this, context, id, TransformFlag.STRIP_FLOW_REQUIRED) };
        }

        const result = await stripFlowTypes(id, code);

        return {
          code: result.code,
          map: result.map,
          /**
           * Treat the transformed code as TSX code
           * because Flow modules can be `.js` files with type annotations and JSX syntax.
           */
          moduleType: 'tsx',
        };
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

  const transformPlugins: rolldown.Plugin[] = builtinPluginConfig
    ? [rollipopReactNativePlugin(builtinPluginConfig)]
    : [codegenPlugin, stripFlowSyntaxPlugin];

  return [...transformPlugins, assetPlugin];
}

export { reactNativePlugin as reactNative };
