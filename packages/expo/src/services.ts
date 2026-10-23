import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'rollipop';

import type { ExpoCompatibility } from './compatibility';
import { getRouterRoot } from './router';

// Expo CLI still performs its initial TypeScript setup. Its incremental route watcher is Metro-specific, so use the same declaration renderer with fs.watch.
export function createExpoServicesPlugin(compatibility: ExpoCompatibility): Plugin {
  const { projectRoot, expoRequire, cli } = compatibility;
  return {
    name: '@rollipop/expo:services',
    configureServer(server) {
      const { exp } = expoRequire('@expo/config').getConfig(projectRoot);
      if (!exp.experiments?.typedRoutes) return;

      const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
      const routerDirectory = getRouterRoot(compatibility, exp);
      const { requireContext } = projectRequire('expo-router/internal/testing');
      const { EXPO_ROUTER_CTX_IGNORE } = projectRequire('expo-router/_ctx-shared');
      const typesDirectory = path.join(projectRoot, '.expo/types');
      const updateRoutes = () => {
        const context = requireContext(routerDirectory, true, EXPO_ROUTER_CTX_IGNORE);
        const declaration = cli.getTypedRoutesDeclarationFile(context, exp.extra?.router);
        fs.mkdirSync(typesDirectory, { recursive: true });
        fs.writeFileSync(path.join(typesDirectory, 'router.d.ts'), declaration);
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const watcher = fs.watch(routerDirectory, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(updateRoutes, 100);
      });
      server.instance.addHook('onClose', async () => {
        clearTimeout(timer);
        watcher.close();
      });
      updateRoutes();
    },
  } satisfies Plugin;
}
