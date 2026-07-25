import type * as rolldown from '@rollipop/rolldown';
import {
  rollipopReactRefreshWrapperPlugin as reactRefresh,
  type RollipopReactRefreshWrapperPluginConfig,
} from '@rollipop/rolldown/experimental';
import { exactRegex, id as idFilter, include } from '@rollipop/rolldown/filter';
import dedent from 'dedent';
import { isNotNil } from 'es-toolkit';

import { ResolvedConfig } from '../../config';
import { ROLLIPOP_VIRTUAL_BOOTSTRAP_ID } from '../../constants';
import type { ResolvedHmrConfig } from '../../utils/config';
import { resolveFrom } from '../../utils/node-resolve';
import { replaceSourceMappingUrl } from '../../utils/source-map';

export interface DevServerPluginOptions {
  cwd: string;
  id: string;
  origin?: string;
  bundleEntry?: string;
  platform: string;
  hmrClientPath: ResolvedConfig['reactNative']['hmrClientPath'];
  hmrConfig: ResolvedHmrConfig | null;
  reactRefreshFilter?: ReactRefreshFilter;
  sourceMapUrl?: string;
}

export type ReactRefreshFilter = Pick<
  RollipopReactRefreshWrapperPluginConfig,
  'include' | 'exclude'
>;

export const DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS = [/\.[tj]sx?(?:$|\?)/];
export const DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS = [/node_modules/];

function sourceMapUrlPlugin(sourceMapUrl: string | undefined): rolldown.Plugin | null {
  if (sourceMapUrl == null) {
    return null;
  }

  return {
    name: 'rollipop:dev-server-source-map-url',
    generateBundle(_outputOptions, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.map != null) {
          output.code = replaceSourceMappingUrl(output.code, sourceMapUrl);
        }
      }
    },
  };
}

async function devServerPlugin(options: DevServerPluginOptions): Promise<rolldown.Plugin[] | null> {
  const {
    cwd,
    id,
    origin,
    bundleEntry,
    platform,
    hmrClientPath,
    hmrConfig,
    reactRefreshFilter = {
      include: DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
      exclude: DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
    },
    sourceMapUrl,
  } = options;
  const plugins: (rolldown.Plugin | null)[] = [sourceMapUrlPlugin(sourceMapUrl)];

  if (hmrConfig != null) {
    const resolvedHmrClientPath = resolveFrom(
      cwd,
      typeof hmrClientPath === 'function' ? await hmrClientPath(cwd) : hmrClientPath,
    );

    const replaceHMRClientPlugin: rolldown.Plugin = {
      name: 'rollipop:replace-hmr-client',
      load: {
        filter: [include(idFilter(exactRegex(resolvedHmrClientPath)))],
        handler(id) {
          this.debug(`Replacing HMR client: ${id}`);
          return {
            code: hmrConfig.clientImplement,
            moduleType: 'ts',
          };
        },
      },
    };

    plugins.push(replaceHMRClientPlugin);
    plugins.push(
      reactRefresh({
        cwd,
        id,
        include: reactRefreshFilter.include,
        exclude: reactRefreshFilter.exclude,
      }),
    );
  }

  if (origin != null && bundleEntry != null) {
    const registerHMRGraphPlugin: rolldown.Plugin = {
      name: 'rollipop:register-hmr-graph',
      transform: {
        filter: [include(idFilter(exactRegex(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)))],
        handler(code) {
          return [
            code,
            dedent`
            if (import.meta.hot && globalThis.__rollipop_runtime__) {
              globalThis.__rollipop_runtime__.registerGraph({
                id: ${JSON.stringify(id)},
                origin: ${JSON.stringify(origin)},
                bundleEntry: ${JSON.stringify(bundleEntry)},
                platform: ${JSON.stringify(platform)},
                runtime: import.meta.hot.runtime,
              });
            }
            `,
          ].join('\n');
        },
      },
    };

    plugins.push(registerHMRGraphPlugin);
  }

  return plugins.filter(isNotNil);
}

export { devServerPlugin as devServer };
