import * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';
import dedent from 'dedent';

import {
  ROLLIPOP_VERSION,
  ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
  ROLLIPOP_VIRTUAL_ENTRY_ID,
  ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID,
} from '../../constants';
import { isExpoBundlerMode } from '../../expo/config-translator';

const VIRTUAL_ENTRY_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_ENTRY_ID)))];
const VIRTUAL_BOOTSTRAP_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)))];

export interface EntryPluginOptions {
  id: string;
  entryPath: string;
  preludePaths?: string[];
}

function entryPlugin(options: EntryPluginOptions): rolldown.Plugin[] {
  const { id, entryPath, preludePaths = [] } = options;

  const expoRouterManifestImport = isExpoBundlerMode()
    ? [ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID]
    : [];

  const importStatements = [
    // Bootstrap Rollipop runtime metadata before evaluating prelude and app modules.
    ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
    ...preludePaths,
    ...expoRouterManifestImport,
    entryPath,
  ]
    .map((modulePath) => `import ${JSON.stringify(modulePath)};`)
    .join('\n');

  // Absolute paths (project entry + react-native prelude) cannot be resolved by
  // Rolldown's default resolver when emitted from a *virtual* entry module, because
  // the virtual module has no filesystem location to anchor node_modules/relative
  // resolution. Intercept them here and treat them as already-resolved file paths.
  const resolvedModulePaths = new Set([entryPath, ...preludePaths]);

  const entryPlugin: rolldown.Plugin = {
    name: 'rollipop:entry',
    resolveId(source) {
      // The virtual entry id resolves to itself.
      if (source === ROLLIPOP_VIRTUAL_ENTRY_ID) {
        return { id: ROLLIPOP_VIRTUAL_ENTRY_ID };
      }
      // Absolute paths (project entry + react-native prelude) emitted into the
      // virtual entry cannot be resolved by Rolldown's default resolver (no
      // filesystem location to anchor from). Treat them as already-resolved file
      // imports. This hook must stay UNFILTERED so it runs for these imports
      // (filtered resolveId hooks are skipped for arbitrary module ids).
      if (resolvedModulePaths.has(source)) {
        return { id: source };
      }
      return null;
    },
    load: {
      filter: VIRTUAL_ENTRY_FILTER,
      handler() {
        return {
          code: importStatements,
          moduleType: 'js',
        };
      },
    },
  };

  const bootstrapPlugin: rolldown.Plugin = {
    name: 'rollipop:bootstrap',
    resolveId: {
      filter: VIRTUAL_BOOTSTRAP_FILTER,
      handler() {
        return ROLLIPOP_VIRTUAL_BOOTSTRAP_ID;
      },
    },
    load: {
      filter: VIRTUAL_BOOTSTRAP_FILTER,
      handler() {
        return {
          code: dedent`
          globalThis.__rollipop_meta__ = globalThis.__rollipop_meta__ || {};
          globalThis.__rollipop_meta__[${JSON.stringify(id)}] = {
            version: ${JSON.stringify(ROLLIPOP_VERSION)},
          };
          `,
          moduleType: 'js',
        };
      },
    },
  };

  return [entryPlugin, bootstrapPlugin];
}

export { entryPlugin as entry };
