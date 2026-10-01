import { initializeRozenite, type RozeniteConfig } from '@rozenite/middleware';
import type { Plugin } from 'rollipop';

import { patchDevtoolsFrontendUrl } from './patch';

export interface RozenitePluginOptions extends Omit<RozeniteConfig, 'projectRoot' | 'projectType'> {
  enabled?: boolean;
}

export function rozenitePlugin(options: RozenitePluginOptions = {}): Plugin {
  const { enabled = false, ...rozeniteConfig } = options;

  return {
    name: 'rollipop:rozenite',
    async configureServer(server) {
      if (!enabled) {
        return;
      }

      const rozenite = await initializeRozenite({
        projectType: 'react-native-cli',
        projectRoot: server.config.root,
        ...rozeniteConfig,
      });

      patchDevtoolsFrontendUrl(server.config.root);

      server.middlewares.use(rozenite.middleware);
    },
  };
}
