import { resolvePolyfillScriptPaths } from './polyfills';
import type { RuntimeStrategy } from './runtime';

export const publicRuntime: RuntimeStrategy = {
  range: '>=0.88.0-0',
  resolve(context) {
    return {
      // Run the public setup module before the app, including when the app does not import react-native itself. InitializeCore is deprecated in 0.88.
      prelude: [context.require.resolve('react-native/setup-env')],
      polyfills: resolvePolyfillScriptPaths(context),
      assetRegistryPath: 'react-native/asset-registry',
    };
  },
};
