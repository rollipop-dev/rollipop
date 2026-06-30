import type * as rolldown from '@rollipop/rolldown';
import { viteAliasPlugin as alias } from '@rollipop/rolldown/experimental';

export interface AliasEntry {
  find: string | RegExp;
  replacement: string;
}

export interface AliasPluginOptions {
  entries: AliasEntry[];
}

function aliasPlugin(options: AliasPluginOptions): rolldown.Plugin | null {
  if (options.entries.length === 0) {
    return null;
  }
  return alias(options);
}

export { aliasPlugin as alias };
