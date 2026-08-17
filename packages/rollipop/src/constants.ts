/**
 * @see `vite.config.ts`
 */
declare global {
  var __ROLLIPOP_VERSION__: string;
}

export const ROLLIPOP_VERSION = globalThis.__ROLLIPOP_VERSION__;

export const ROLLIPOP_VIRTUAL_PREFIX = '\0rollipop/';
export const ROLLIPOP_VIRTUAL_BOOTSTRAP_ID = `${ROLLIPOP_VIRTUAL_PREFIX}bootstrap`;
export const ROLLIPOP_VIRTUAL_ENTRY_ID = `${ROLLIPOP_VIRTUAL_PREFIX}entry`;

/**
 * Expo compatibility virtual modules (only materialized when Rollipop runs as
 * the Expo bundler, i.e. `EXPO_BUNDLER=rollipop`).
 *
 * - `expo-metro-runtime`: shim that stands in for `@expo/metro-runtime` so
 *   Expo Router / error overlays keep working without Metro.
 * - `expo-router/_ctx`: Expo Router 57 reads its route tree from the
 *   `expo-router/_ctx` module's `ctx` export — a RequireContext over the
 *   `app/` directory (Metro generates this at build time). Rollipop materializes
 *   it as a virtual module so `getRoutes(ctx)` builds the full route tree
 *   (groups, dynamic `[id]`, rest `[...slug]`, modals, not-found, layouts)
 *   natively, without hand-rolling a manifest.
 */
export const ROLLIPOP_VIRTUAL_EXPO_METRO_RUNTIME_ID = `${ROLLIPOP_VIRTUAL_PREFIX}expo-metro-runtime`;
export const ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID = 'expo-router/_ctx';

/**
 * @see {@link https://github.com/facebook/metro/blob/0.81.x/docs/Configuration.md#resolvermainfields}
 */
export const DEFAULT_RESOLVER_MAIN_FIELDS = ['react-native', 'browser', 'main'];
export const DEFAULT_RESOLVER_ALIAS_FIELDS = [['react-native'], ['browser']];
export const DEFAULT_RESOLVER_CONDITION_NAMES = ['react-native']; // Note: `import` and `require` are added internally by Rolldown.

/**
 * Unlike the Metro bundler configuration, this prioritizes resolving TypeScript and ESM first.
 *
 * @see {@link https://github.com/facebook/metro/blob/0.81.x/packages/metro-config/src/defaults/defaults.js}
 * @see {@link https://github.com/facebook/metro/blob/0.81.x/packages/metro-file-map/src/workerExclusionList.js}
 */
export const DEFAULT_SOURCE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  // Additional module formats
  'mjs',
  'cjs',
  // JSON files
  'json',
];

export const DEFAULT_IMAGE_EXTENSIONS = ['bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'svg', 'webp'];

export const IMAGE_EXTENSIONS = [...DEFAULT_IMAGE_EXTENSIONS, 'tiff', 'ktx'];

export const DEFAULT_ASSET_EXTENSIONS = [
  ...DEFAULT_IMAGE_EXTENSIONS,
  // Drawable non-image formats
  'xml',
  // Video formats
  'm4v',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
  // Audio formats
  'aac',
  'aiff',
  'caf',
  'm4a',
  'mp3',
  'wav',
  // Document formats
  'html',
  'pdf',
  'yaml',
  'yml',
  // Font formats
  'otf',
  'ttf',
  // Archives (virtual files)
  'zip',
];

export const DEFAULT_ASSET_REGISTRY_PATH = 'react-native/Libraries/Image/AssetRegistry.js';
export const DEFAULT_HMR_CLIENT_PATH = 'react-native/Libraries/Utilities/HMRClient.js';

export const DEFAULT_ENV_PREFIX = 'ROLLIPOP_';

export const DEFAULT_ENV_FILE = '.env';

export const DEFAULT_RUNTIME_TARGET = 'hermes-v1';

export const DEFAULT_ANALYZE_FILE = 'analyze-data.json';
export const DEFAULT_ANALYZE_REPORT_FILE = 'report.html';
