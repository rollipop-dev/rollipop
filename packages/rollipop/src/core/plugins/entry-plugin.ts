import * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';
import dedent from 'dedent';

import { ROLLIPOP_VERSION, ROLLIPOP_VIRTUAL_ENTRY_ID } from '../../constants';

const VIRTUAL_ENTRY_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_ENTRY_ID)))];
const ROLLIPOP_META = dedent`
globalThis.__rollipop_meta__ = globalThis.__rollipop_meta__ || {
  version: ${JSON.stringify(ROLLIPOP_VERSION)},
};
`;

export interface EntryPluginOptions {
  entryPath: string;
  preludePaths?: string[];
}

function entryPlugin(options: EntryPluginOptions): rolldown.Plugin {
  const { entryPath, preludePaths = [] } = options;

  const importStatements = [...preludePaths, entryPath]
    .map((modulePath) => `import ${JSON.stringify(modulePath)};`)
    .join('\n');

  return {
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
          code: [ROLLIPOP_META, importStatements].join('\n'),
          moduleType: 'js',
        };
      },
    },
  };
}

export { entryPlugin as entry };
