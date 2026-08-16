/**
 * Inlined JS source for the `@expo/metro-runtime` shim virtual module.
 *
 * This mirrors `../expo/runtime-shim.ts` (the typed reference implementation) but
 * as a plain JS string so the dev/bundle pipeline can `load` it without an extra
 * transpile step. The unit test asserts the two stay in sync (same export names).
 */
export const expoMetroRuntimeShimCode = `
const noop = () => {};
export function createRuntimeError(message, stack) {
  const error = new Error(message);
  if (stack) error.stack = stack;
  return error;
}
export function getDevServer() {
  // Mirror of runtime-shim.ts: read from process.env (reliable on RN). The
  // import.meta.env member access is statically replaced with ({}) for Hermes,
  // so it can never carry a real value.
  const env = (typeof process !== 'undefined' && process.env) || {};
  const url = env.ROLLIPOP_DEV_SERVER_URL || env.EXPO_PACKAGER_PROXY_URL || null;
  return url ? { url } : null;
}
export function enableExperimental() {}
export function clearSegmentCache() {}
export async function loadBundleAsync() { return Promise.resolve(); }
export function reload() {
  if (typeof import.meta !== 'undefined' && import.meta.hot) {
    import.meta.hot.invalidate();
  } else if (typeof location !== 'undefined' && typeof location.reload === 'function') {
    location.reload();
  }
}
export const LogBox = {
  ignoreAllLogs: noop, ignoreLogs: noop, ignoreWarnings: noop, install: noop,
  uninstall: noop, addException: noop, clear: noop,
};
export const __mapper = new Map();
export function setMapper() {}
export default {
  createRuntimeError, getDevServer, enableExperimental, clearSegmentCache,
  loadBundleAsync, reload, LogBox, __mapper, setMapper,
};
`;
