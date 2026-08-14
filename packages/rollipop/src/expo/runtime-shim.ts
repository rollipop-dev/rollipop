/**
 * Rollipop-compatible shim for `@expo/metro-runtime`.
 *
 * Expo Router, the error overlay (`expo/build/error-overlay`) and the
 * `@expo/metro-runtime` entry import a handful of runtime helpers that Metro
 * injects (HMR client, red-box formatting, async bundle loading). When Rollipop
 * is the bundler (no Metro), those imports must still resolve, so this module
 * provides the same named export surface with Rollipop-appropriate behavior:
 *
 * - HMR / reload are delegated to `import.meta.hot` when present (Rollipop's
 *   dev engine), otherwise no-ops in production.
 * - Error overlay + LogBox helpers are lightweight no-ops (Rollipop ships its
 *   own overlay); `createRuntimeError` preserves the error object so callers
 *   that re-throw still work.
 * - `loadBundleAsync` / `clearSegmentCache` are async no-ops (segment preloading
 *   is a Metro concept; Rollipop serves the whole graph from one bundle).
 *
 * The export names intentionally match `@expo/metro-runtime`'s public API so the
 * existing imports in the Expo dependency tree keep working unchanged.
 */

const noop = (): void => {};

export function createRuntimeError(message: string, stack?: string | null): Error {
  const error = new Error(message);
  if (stack) {
    error.stack = stack;
  }
  return error;
}

export function getDevServer(): { url: string } | null {
  // Rollipop's dev engine exposes the server origin through `import.meta.env`.
  const origin =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    null;
  return origin ? { url: origin } : null;
}

export function enableExperimental(_featureName: string): void {
  // No Metro experimental flags under Rollipop; accepted for API parity.
}

export function clearSegmentCache(): void {
  // Segment preloading is unused under the single-bundle Rollipop model.
}

export async function loadBundleAsync(_bundlePath: string): Promise<void> {
  // Rollipop serves the entire module graph in one bundle; there are no
  // separately-loadable Metro segments to fetch.
  return Promise.resolve();
}

export function reload(): void {
  const globalLocation =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { location?: { reload?: () => void } }).location
      : undefined;
  if (typeof import.meta !== 'undefined' && (import.meta as { hot?: unknown }).hot) {
    (import.meta as unknown as { hot: { invalidate: (s?: string) => void } }).hot.invalidate();
  } else if (globalLocation && typeof globalLocation.reload === 'function') {
    globalLocation.reload();
  }
}

export const LogBox = {
  ignoreAllLogs: noop,
  ignoreLogs: noop,
  ignoreWarnings: noop,
  install: noop,
  uninstall: noop,
  addException: noop,
  clear: noop,
};

export const __mapper = new Map<string, string>();

export function setMapper(_mapper: Map<string, string>): void {
  // Metro maps minified -> original module ids for the overlay; Rollipop source
  // maps already carry that information, so this is a no-op for parity.
}

export default {
  createRuntimeError,
  getDevServer,
  enableExperimental,
  clearSegmentCache,
  loadBundleAsync,
  reload,
  LogBox,
  __mapper,
  setMapper,
};
