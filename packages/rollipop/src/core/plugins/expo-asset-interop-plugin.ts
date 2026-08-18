import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';

/**
 * Match `expo-asset`'s `resolveAssetSource` modules (native + base) ONLY.
 *
 * IMPORTANT: this must NOT match React Native's own
 * `react-native/Libraries/Image/resolveAssetSource`. That module is handled
 * separately by `rollipop:resolve-asset-source-interop`, which rewrites its
 * self-referential default export. If this filter also matched RN's copy, the
 * replacement below would `import resolveAssetSource from
 * 'react-native/Libraries/Image/resolveAssetSource'` — i.e. the module would
 * import itself — re-introducing the exact self-referential default interop bug
 * (the module body gets dropped and `Image` crashes).
 *
 * We anchor on the package directory name `expo-asset` plus the known file
 * basename, which is stable across RN / Expo / pnpm-layout changes. A future RN
 * bump that moves the file still matches by basename as long as it lives under
 * an `expo-asset/` directory.
 */
export const RESOLVE_ASSET_SOURCE_RE =
  /(^|\/)expo-asset\/.{0,40}resolveAssetSource(\.[^/\\]+)?\.js$/;

const RESOLVE_ASSET_SOURCE_FILTER = [include(id(RESOLVE_ASSET_SOURCE_RE))];

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
 * a `MISSING_EXPORT` error.
 *
 * This shim re-exports the property as a named export so Expo SDK 57 / RN 0.86
 * apps bundle without patching upstream `expo-asset`.
 *
 * NOTE: this is implemented as a `load` hook (not `transform`). In Rolldown's
 * dev/serve mode, module contents are served through `load` hooks; `transform`
 * hooks are not invoked for module bodies in that mode, so a `transform`-based
 * shim would silently never run and the `MISSING_EXPORT` would persist.
 *
 * Scoped to Expo mode only; non-Expo React Native builds are unaffected.
 */
function expoAssetInteropPlugin(options: ExpoAssetInteropPluginOptions): rolldown.Plugin | null {
  if (!options.enabled) {
    return null;
  }

  return {
    name: 'rollipop:expo-asset-interop',
    load: {
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
