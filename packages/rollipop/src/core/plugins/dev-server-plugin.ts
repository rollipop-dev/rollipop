import type * as rolldown from '@rollipop/rolldown';
import {
  rollipopReactRefreshWrapperPlugin as reactRefresh,
  type RollipopReactRefreshWrapperPluginConfig,
} from '@rollipop/rolldown/experimental';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';

import { ResolvedConfig } from '../../config';
import type { ResolvedHmrConfig } from '../../utils/config';
import { resolveFrom } from '../../utils/node-resolve';
import {
  endsWithLineBreak,
  findFirstNonInlineWhitespaceIndex,
  findLastNonEmptyLine,
} from '../../utils/string';

export interface DevServerPluginOptions {
  cwd: string;
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

const SOURCE_MAPPING_URL_PREFIX = 'sourceMappingURL=';
const HASH_SOURCE_MAPPING_COMMENT_MARKER = '#';
const AT_SOURCE_MAPPING_COMMENT_MARKER = '@';
const LINE_COMMENT_PREFIX = '//';

function replaceSourceMappingUrl(code: string, sourceMapUrl: string) {
  const comment = `//# sourceMappingURL=${sourceMapUrl}`;
  const lastLine = findLastNonEmptyLine(code);

  if (lastLine != null && isSourceMappingUrlCommentLine(code, lastLine.start, lastLine.end)) {
    return `${code.slice(0, lastLine.start)}${comment}`;
  }

  return `${code}${endsWithLineBreak(code) ? '' : '\n'}${comment}`;
}

function isSourceMappingUrlCommentLine(code: string, start: number, end: number) {
  if (!code.startsWith(LINE_COMMENT_PREFIX, start)) {
    return false;
  }

  let index = findFirstNonInlineWhitespaceIndex(code, start + LINE_COMMENT_PREFIX.length, end);
  const commentType = code[index];

  if (
    commentType !== HASH_SOURCE_MAPPING_COMMENT_MARKER &&
    commentType !== AT_SOURCE_MAPPING_COMMENT_MARKER
  ) {
    return false;
  }

  index = findFirstNonInlineWhitespaceIndex(
    code,
    index + HASH_SOURCE_MAPPING_COMMENT_MARKER.length,
    end,
  );

  return code.startsWith(SOURCE_MAPPING_URL_PREFIX, index);
}

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
    hmrClientPath,
    hmrConfig,
    reactRefreshFilter = {
      include: DEFAULT_REACT_REFRESH_INCLUDE_PATTERNS,
      exclude: DEFAULT_REACT_REFRESH_EXCLUDE_PATTERNS,
    },
    sourceMapUrl,
  } = options;
  const plugins = [sourceMapUrlPlugin(sourceMapUrl)].filter((plugin) => plugin != null);

  if (hmrConfig == null) {
    // HMR Disabled
    return plugins.length > 0 ? plugins : null;
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

  plugins.push(replaceHMRClientPlugin, reactRefresh({ cwd, ...reactRefreshFilter }));

  return plugins;
}

export { devServerPlugin as devServer };
