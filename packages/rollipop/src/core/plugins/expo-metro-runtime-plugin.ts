import { fileURLToPath } from 'node:url';

import type * as rolldown from '@rollipop/rolldown';

import { isExpoBundlerMode } from '../../expo/config-translator';

const METRO_RUNTIME_SHIM_PATH = fileURLToPath(new URL('../../runtime-shim.js', import.meta.url));

/**
 * Redirect `@expo/metro-runtime` (and its subpaths) to Rollipop's
 * Rollipop-compatible shim so Expo Router / error-overlay imports resolve when
 * Rollipop is the bundler.
 *
 * The `resolveId` hook is intentionally **unfiltered**. rolldown's dev engine
 * (`rolldown.dev()`, used by `rollipop start`) does not run `resolveId` filters
 * for external `node_modules` specifiers the way `rolldown.build()` does, so a
 * filtered hook silently never fires in dev. An unfiltered hook fires in both
 * modes. We return the real, resolvable shim module path (not a virtual id)
 * because the native resolver loads a real file path/found module in either
 * engine.
 */
function expoMetroRuntimePlugin(): rolldown.Plugin | null {
  if (!isExpoBundlerMode()) {
    return null;
  }

  return {
    name: 'rollipop:expo-metro-runtime',
    resolveId(source) {
      if (source === '@expo/metro-runtime' || source.startsWith('@expo/metro-runtime/')) {
        return METRO_RUNTIME_SHIM_PATH;
      }
      return null;
    },
  };
}

export { expoMetroRuntimePlugin };
