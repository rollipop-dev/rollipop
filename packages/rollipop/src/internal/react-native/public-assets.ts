import { resolvePolyfillScriptPaths } from './polyfills';
import type { RuntimeStrategy } from './runtime';

// Use RN 0.87's public asset registry while retaining its existing prelude.
export const publicAssetsRuntime: RuntimeStrategy = {
  range: '>=0.87.0-0 <0.88.0-0',
  resolve(context) {
    return {
      prelude: [context.require.resolve('./Libraries/Core/InitializeCore')],
      polyfills: resolvePolyfillScriptPaths(context),
      assetRegistryPath: 'react-native/asset-registry',
    };
  },
};
