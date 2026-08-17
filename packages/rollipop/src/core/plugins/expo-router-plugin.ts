import type * as rolldown from '@rollipop/rolldown';

import { ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID } from '../../constants';
import {
  resolveAppDir,
  scanRouteFiles,
  serializeExpoRouterContextCode,
} from '../../expo/router-context';

export interface ExpoRouterPluginOptions {
  /** When false the plugin is a no-op (Rollipop is not the Expo bundler). */
  enabled: boolean;
  /** Project root used to locate the `app/` directory. */
  projectRoot: string;
}

/**
 * Materializes `expo-router/_ctx` as a virtual module so Expo Router 57 can
 * discover its route tree without Metro.
 *
 * `expo-router/entry` (via `qualified-entry.js`) does `require("expo-router/_ctx")`
 * and reads `.ctx` — a RequireContext over `app/`. Metro generates this module
 * during serialization; Rollipop generates it here from the filesystem. The
 * emitted `ctx` satisfies the exact shape `getRoutes()` consumes, so the full
 * route tree (groups, dynamic `[id]`, rest `[...slug]`, modals, `+not-found`,
 * nested layouts) is built natively.
 *
 * The resolver is intentionally **unfiltered**: `rolldown.dev()` does not run
 * `resolveId` filters for external `node_modules` specifiers, so a filtered
 * hook would silently never fire in dev. Returning the virtual id for
 * `expo-router/_ctx` works in both `build` and `dev` modes.
 */
function expoRouterPlugin(options: ExpoRouterPluginOptions): rolldown.Plugin | null {
  if (!options.enabled) {
    return null;
  }

  const appDir = resolveAppDir(options.projectRoot);
  const entries = scanRouteFiles(appDir);
  const code = serializeExpoRouterContextCode(entries);

  return {
    name: 'rollipop:expo-router',
    resolveId(source) {
      if (source === ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID) {
        return { id: ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID };
      }
      return null;
    },
    load: {
      filter: {
        id: new RegExp(
          `^${ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        ),
      },
      handler(resolvedId) {
        if (resolvedId === ROLLIPOP_VIRTUAL_EXPO_ROUTER_CTX_ID) {
          return {
            code,
            moduleType: 'js',
          };
        }
        return null;
      },
    },
  };
}

export { expoRouterPlugin as expoRouter };
