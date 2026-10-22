import { resolvePolyfillScriptPaths } from './polyfills';
import type { RuntimeStrategy } from './runtime';

export const legacyRuntime: RuntimeStrategy = {
  range: '<0.87.0-0',
  resolve(context) {
    return {
      prelude: [context.require.resolve('./Libraries/Core/InitializeCore')],
      polyfills: resolvePolyfillScriptPaths(context),
      assetRegistryPath: 'react-native/Libraries/Image/AssetRegistry.js',
    };
  },
};
