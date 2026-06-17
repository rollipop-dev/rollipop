/**
 * @see `vite.config.ts`
 */
declare global {
  var __ROLLIPOP_VERSION__: string;
}

export const ROLLIPOP_VERSION = globalThis.__ROLLIPOP_VERSION__;

export const ROLLIPOP_VIRTUAL_PREFIX = '\0rollipop/';
export const ROLLIPOP_VIRTUAL_ENTRY_ID = `${ROLLIPOP_VIRTUAL_PREFIX}entry`;

/**
 * @see {@link https://github.com/facebook/metro/blob/0.81.x/docs/Configuration.md#resolvermainfields}
 */
export const DEFAULT_RESOLVER_MAIN_FIELDS = ['react-native', 'browser', 'main'];
export const DEFAULT_RESOLVER_ALIAS_FIELDS = [['react-native'], ['browser']];
// Rolldown adds `import` or `require` per dependency edge.
export const DEFAULT_RESOLVER_CONDITION_NAMES = ['react-native'];

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

export const DEFAULT_REACT_NATIVE_GLOBAL_IDENTIFIERS = [
  // polyfillPromise
  'Promise',
  // setUpRegeneratorRuntime
  'regeneratorRuntime',
  // setUpXHR
  'XMLHttpRequest',
  'FormData',
  'fetch',
  'Headers',
  'Request',
  'Response',
  'WebSocket',
  'Blob',
  'File',
  'FileReader',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal',
  // setUpTimers
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  // setUpTimers (Bridgeless)
  'requestIdleCallback',
  'cancelIdleCallback',
  // setUpTimers (Bridge)
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  // setUpDOM
  'DOMRect',
  'DOMRectReadOnly',
  'DOMRectList',
  'HTMLCollection',
  'NodeList',
  'Node',
  'Document',
  'CharacterData',
  'Text',
  'Element',
  'HTMLElement',
  // setUpIntersectionObserver
  'IntersectionObserver',
  // setUpMutationObserver
  'MutationObserver',
  'MutationRecord',
  // setUpPerformanceModern
  'EventCounts',
  'Performance',
  'PerformanceEntry',
  'PerformanceEventTiming',
  'PerformanceLongTaskTiming',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceResourceTiming',
  'TaskAttributionTiming',
];

export const DEFAULT_ENV_PREFIX = 'ROLLIPOP_';

export const DEFAULT_ENV_FILE = '.env';

export const DEFAULT_RUNTIME_TARGET = 'hermes-v1';
