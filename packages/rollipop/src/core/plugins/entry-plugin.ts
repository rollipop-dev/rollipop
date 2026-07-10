import * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';
import dedent from 'dedent';

import {
  ROLLIPOP_VERSION,
  ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
  ROLLIPOP_VIRTUAL_ENTRY_ID,
} from '../../constants';

const VIRTUAL_ENTRY_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_ENTRY_ID)))];
const VIRTUAL_BOOTSTRAP_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)))];

export interface EntryPluginOptions {
  id: string;
  entryPath: string;
  preludePaths?: string[];
}

function entryPlugin(options: EntryPluginOptions): rolldown.Plugin[] {
  const { id, entryPath, preludePaths = [] } = options;

  const importStatements = [
    // Bootstrap Rollipop runtime metadata before evaluating prelude and app modules.
    ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
    ...preludePaths,
    entryPath,
  ]
    .map((modulePath) => `import ${JSON.stringify(modulePath)};`)
    .join('\n');

  const entryPlugin: rolldown.Plugin = {
    name: 'rollipop:entry',
    resolveId: {
      filter: VIRTUAL_ENTRY_FILTER,
      handler() {
        return ROLLIPOP_VIRTUAL_ENTRY_ID;
      },
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
