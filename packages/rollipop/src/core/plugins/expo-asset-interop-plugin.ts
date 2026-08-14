import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';

/**
 * Match `expo-asset`'s `resolveAssetSource` modules (native + base). These ship
 * raw JSX-free ESM that re-exports from React Native's CJS `resolveAssetSource`.
 * Use a trailing-anchor RegExp (not `exactRegex`, which anchors both ends) so
 * the variable pnpm store path prefix is ignored.
 */
const RESOLVE_ASSET_SOURCE_FILTER = [
  include(id(new RegExp('resolveAssetSource(\\.native)?\\.js$'))),
];

export interface ExpoAssetInteropPluginOptions {
  /** When false the plugin is a no-op (Rollipop is not the Expo bundler). */
  enabled: boolean;
}

/**
 * React Native 0.86 exposes `setCustomSourceTransformer` as a *property* of the
 * default export of `react-native/Libraries/Image/resolveAssetSource`
 * (`resolveAssetSource.setCustomSourceTransformer = …`), not as a named export.
 * `expo-asset`'s `Asset.fx.js` imports it as a named export:
 *
 *   import resolveAssetSource, { setCustomSourceTransformer } from './resolveAssetSource';
 *
 * Metro tolerates this via CJS named-export interop, but Rolldown's strict
 * `export *` re-export does not surface the property as a named export, producing
 * a `MISSING_EXPORT` error. This shim re-exports the property as a named export
 * so Expo SDK 57 / RN 0.86 apps bundle without patching upstream `expo-asset`.
 *
 * Scoped to Expo mode only; non-Expo React Native builds are unaffected.
 */
function expoAssetInteropPlugin(options: ExpoAssetInteropPluginOptions): rolldown.Plugin | null {
  if (!options.enabled) {
    return null;
  }

  return {
    name: 'rollipop:expo-asset-interop',
    transform: {
      filter: RESOLVE_ASSET_SOURCE_FILTER,
      handler() {
        // RN 0.86 exposes `setCustomSourceTransformer` as a property of the
        // default export (`resolveAssetSource.setCustomSourceTransformer = …`).
        // Re-export it explicitly as a named export (and keep the default) so
        // `expo-asset`'s `Asset.fx.js` named import resolves under Rolldown
        // without relying on `export *` CJS-interop forwarding.
        const code =
          "import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';\n" +
          'export default resolveAssetSource;\n' +
          'export const setCustomSourceTransformer = resolveAssetSource?.setCustomSourceTransformer;\n';
        return {
          code,
          moduleType: 'js',
        };
      },
    },
  };
}

export { expoAssetInteropPlugin as expoAssetInterop };
