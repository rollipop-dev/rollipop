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

        // Codegen `NativeComponent` files are handled by the
        // `@react-native/babel-plugin-codegen` plugin (pushed by `getPreset`
        // when `CODEGEN_REQUIRED` is set). That plugin runs its OWN Flow parser
        // over the original source to extract the native component schema, so
        // the Flow syntax must be preserved here — we must NOT strip Flow and
        // must NOT flag the module as flow-stripped (doing so would make
        // `getPreset` attach the `typescript` parser, which rejects Flow-only
        // syntax like `T: {...}` and fails with "Could not find component
        // config"). We simply leave the source untouched; `getPreset` detects
        // the `CODEGEN_REQUIRED` flag and parses it with the `flow` parser.
        if (flags & TransformFlag.CODEGEN_REQUIRED) {
          return;
        }

        // Other Flow modules (non-codegen) ship Flow type syntax that the
        // TypeScript parser can't read. Strip Flow so downstream TS/JSX parsing
        // succeeds, and flag the module as Flow-stripped so the Babel plugin
        // attaches the `typescript` parser to read the (now TS-like) result.
        const result = await stripFlowTypes(id, code);

        return {
          code: result.code,
          map: result.map,
          /**
           * Treat the transformed code as TSX code
           * because Flow modules can be `.js` files with type annotations and JSX syntax.
           */
          meta: setFlag.call(this, context, id, TransformFlag.STRIP_FLOW_REQUIRED),
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

  // Metro maps the virtual `react-native/asset-registry` specifier (required by
  // `expo-asset`) to `react-native/Libraries/Image/AssetRegistry.js` via a
  // `resolveRequest` hook in `@react-native/metro-config`. Rollipop must do the
  // same: without it, `__rollipop_require__('react-native/asset-registry')`
  // fails at runtime with "Module react-native/asset-registry is not registered".
  // `assetRegistryPath` defaults to exactly that file path.
  const assetRegistryResolver: rolldown.Plugin = {
    name: 'rollipop:react-native-asset-registry',
    resolveId(source) {
      if (source === 'react-native/asset-registry') {
        return { id: assetRegistryPath };
      }
      return null;
    },
  };

  return [...transformPlugins, assetRegistryResolver, assetPlugin];
}

export { reactNativePlugin as reactNative };
