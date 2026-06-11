import type * as rolldown from '@rollipop/rolldown';
import { rollipopReactRefreshWrapperPlugin as reactRefresh } from '@rollipop/rolldown/experimental';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';

import { ResolvedConfig } from '../../config';
import type { ResolvedHmrConfig } from '../../utils/config';
import { resolveFrom } from '../../utils/node-resolve';

export interface DevServerPluginOptions {
  cwd: string;
  hmrClientPath: ResolvedConfig['reactNative']['hmrClientPath'];
  hmrConfig: ResolvedHmrConfig | null;
}

async function devServerPlugin(options: DevServerPluginOptions): Promise<rolldown.Plugin[] | null> {
  const { cwd, hmrClientPath, hmrConfig } = options;

  if (hmrConfig == null) {
    // HMR Disabled
    return null;
  }

  const resolvedHmrClientPath = resolveFrom(
    cwd,
    typeof hmrClientPath === 'function' ? await hmrClientPath(cwd) : hmrClientPath,
  );

  const replaceHMRClientPlugin: rolldown.Plugin = {
    name: 'rollipop:replace-hmr-client',
    load: {
      filter: [include(id(exactRegex(resolvedHmrClientPath)))],
      handler(id) {
        this.debug(`Replacing HMR client: ${id}`);
        return {
          code: hmrConfig.clientImplement,
          moduleType: 'ts',
        };
      },
    },
  };

  return [
    replaceHMRClientPlugin,
    reactRefresh({
      cwd,
      include: [/\.[tj]sx?(?:$|\?)/],
      exclude: [/\/node_modules\//],
    }),
  ];
}

export { devServerPlugin as devServer };
