import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';

import { ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID } from '../../constants';
import {
  generateExpoRouterManifest,
  serializeExpoRouterManifestCode,
} from '../../expo/router-manifest';

const ROUTER_MANIFEST_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID)))];

export interface ExpoRouterPluginOptions {
  /** When false the plugin is a no-op (Rollipop is not the Expo bundler). */
  enabled: boolean;
  /** Project root used to locate the `app/` directory. */
  projectRoot: string;
  /** Override the app directory (defaults to `<projectRoot>/app`). */
  appDir?: string;
}

/**
 * Scans `app/` at build start and injects a virtual module exposing the Expo
 * Router route manifest, so `expo-router/entry` can bootstrap navigation
 * without Metro's custom resolver.
 */
function expoRouterPlugin(options: ExpoRouterPluginOptions): rolldown.Plugin | null {
  if (!options.enabled) {
    return null;
  }

  const appDir = options.appDir ?? path.join(options.projectRoot, 'app');
  const manifest = generateExpoRouterManifest(appDir);

  return {
    name: 'rollipop:expo-router',
    resolveId: {
      filter: ROUTER_MANIFEST_FILTER,
      handler(source) {
        if (source === ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID) {
          return ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID;
        }
        return null;
      },
    },
    load: {
      filter: ROUTER_MANIFEST_FILTER,
      handler(resolvedId) {
        if (resolvedId === ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID) {
          return {
            code: serializeExpoRouterManifestCode(manifest),
            moduleType: 'js',
          };
        }
        return null;
      },
    },
  };
}

export { expoRouterPlugin as expoRouter };

// Re-export so the entry composer can import the virtual id without a cycle.
export { ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID };
