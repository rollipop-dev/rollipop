import path from 'node:path';

import { interpreter } from '@rollipop/rolldown/filter';
import { describe, expect, it } from 'vite-plus/test';

import { ROLLIPOP_VIRTUAL_ENTRY_ID } from '../../../constants';
import { entry } from '../entry-plugin';

type Filter = Parameters<typeof interpreter>[0];

describe('entry plugin', () => {
  it('loads a virtual entry that imports the app entry', () => {
    const entryPath = path.join('/project', 'index.js');
    const plugin = entry({ entryPath });
    const load = plugin.load as {
      filter: Filter;
      handler: (id: string) => unknown;
    };

    expect(interpreter(load.filter, undefined, ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(true);
    expect(interpreter(load.filter, undefined, entryPath)).toBe(false);
    expect(load.handler(ROLLIPOP_VIRTUAL_ENTRY_ID)).toEqual({
      code: `import ${JSON.stringify(entryPath)};`,
      moduleType: 'js',
    });
  });

  it('filters resolve to the virtual entry id', () => {
    const entryPath = path.join('/project', 'index.js');
    const plugin = entry({
      entryPath,
      preludePaths: [path.join('/project', 'prelude.js')],
    });
    const resolveId = plugin.resolveId as {
      filter: Filter;
      handler: (source: string) => string | undefined;
    };

    expect(interpreter(resolveId.filter, undefined, ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(true);
    expect(interpreter(resolveId.filter, undefined, entryPath)).toBe(false);
    expect(resolveId.handler(ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(ROLLIPOP_VIRTUAL_ENTRY_ID);
  });

  it('loads a virtual entry that imports prelude modules before the app entry', () => {
    const entryPath = path.join('/project', 'index.js');
    const preludePath = path.join('/project', 'prelude.js');
    const plugin = entry({ entryPath, preludePaths: [preludePath] });
    const load = plugin.load as {
      filter: Filter;
      handler: (id: string) => unknown;
    };

    expect(interpreter(load.filter, undefined, ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(true);
    expect(interpreter(load.filter, undefined, entryPath)).toBe(false);
    expect(load.handler(ROLLIPOP_VIRTUAL_ENTRY_ID)).toEqual({
      code: `import ${JSON.stringify(preludePath)};\nimport ${JSON.stringify(entryPath)};`,
      moduleType: 'js',
    });
  });
});
