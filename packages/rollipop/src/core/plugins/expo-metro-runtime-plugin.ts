import type * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';

import { ROLLIPOP_VIRTUAL_EXPO_METRO_RUNTIME_ID } from '../../constants';
import { expoMetroRuntimeShimCode } from './expo-metro-runtime-shim-code';

const METRO_RUNTIME_FILTER = [include(id(exactRegex('^@expo\\/metro-runtime(\\/.*)?$')))];

const METRO_RUNTIME_SHIM_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_EXPO_METRO_RUNTIME_ID)))];

export interface ExpoMetroRuntimePluginOptions {
  /** When false the plugin is a no-op (Rollipop is not the Expo bundler). */
  enabled: boolean;
}

/**
 * Redirects every import of `@expo/metro-runtime` (and its subpaths) to
 * Rollipop's Rollipop-compatible shim virtual module, so the Expo Router / error
 * overlay code path resolves without Metro.
 */
function expoMetroRuntimePlugin(options: ExpoMetroRuntimePluginOptions): rolldown.Plugin | null {
  if (!options.enabled) {
    return null;
  }

  return {
    name: 'rollipop:expo-metro-runtime',
    resolveId: {
      filter: METRO_RUNTIME_FILTER,
      handler(source) {
        if (/^@expo\/metro-runtime(\/.*)?$/.test(source)) {
          return ROLLIPOP_VIRTUAL_EXPO_METRO_RUNTIME_ID;
        }
        return null;
      },
    },
    load: {
      filter: METRO_RUNTIME_SHIM_FILTER,
      handler(resolvedId) {
        if (resolvedId === ROLLIPOP_VIRTUAL_EXPO_METRO_RUNTIME_ID) {
          return {
            code: expoMetroRuntimeShimCode,
            moduleType: 'js',
          };
        }
        return null;
      },
    },
  };
}

export { expoMetroRuntimePlugin as expoMetroRuntime };
