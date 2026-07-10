import path from 'node:path';

import { interpreter } from '@rollipop/rolldown/filter';
import { describe, expect, it } from 'vite-plus/test';

import {
  ROLLIPOP_VERSION,
  ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
  ROLLIPOP_VIRTUAL_ENTRY_ID,
} from '../../../constants';
import { evaluateContext } from '../../../testing/evaluate-context';
import { entry } from '../entry-plugin';

type Filter = Parameters<typeof interpreter>[0];

const BUNDLER_ID = '1abc-def';

describe('entry plugin', () => {
  it('loads a virtual entry that imports the app entry', () => {
    const entryPath = path.join('/project', 'index.js');
    const plugin = entry({ id: BUNDLER_ID, entryPath })[0]!;
    const load = plugin.load as {
      filter: Filter;
      handler: (id: string) => unknown;
    };

    expect(interpreter(load.filter, undefined, ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(true);
    expect(interpreter(load.filter, undefined, entryPath)).toBe(false);
    expect(load.handler(ROLLIPOP_VIRTUAL_ENTRY_ID)).toEqual({
      code: [
        `import ${JSON.stringify(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)};`,
        `import ${JSON.stringify(entryPath)};`,
      ].join('\n'),
      moduleType: 'js',
    });
  });

  it('filters resolve to the virtual entry id', () => {
    const entryPath = path.join('/project', 'index.js');
    const plugin = entry({
      id: BUNDLER_ID,
      entryPath,
      preludePaths: [path.join('/project', 'prelude.js')],
    })[0]!;
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
    const plugin = entry({
      id: BUNDLER_ID,
      entryPath,
      preludePaths: [preludePath],
    })[0]!;
    const load = plugin.load as {
      filter: Filter;
      handler: (id: string) => unknown;
    };

    expect(interpreter(load.filter, undefined, ROLLIPOP_VIRTUAL_ENTRY_ID)).toBe(true);
    expect(interpreter(load.filter, undefined, entryPath)).toBe(false);
    expect(load.handler(ROLLIPOP_VIRTUAL_ENTRY_ID)).toEqual({
      code: [
        `import ${JSON.stringify(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)};`,
        `import ${JSON.stringify(preludePath)};`,
        `import ${JSON.stringify(entryPath)};`,
      ].join('\n'),
      moduleType: 'js',
    });
  });

  it('bootstraps metadata using the bundler id as a computed property', () => {
    const plugin = entry({ id: BUNDLER_ID, entryPath: '/project/index.js' })[1]!;
    const load = plugin.load as {
      filter: Filter;
      handler: (id: string) => { code: string; moduleType: string };
    };

    expect(interpreter(load.filter, undefined, ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)).toBe(true);
    const result = load.handler(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID);
    const metadata = evaluateContext().evaluate(`${result.code}\nglobalThis.__rollipop_meta__;`);

    expect(result.moduleType).toBe('js');
    expect(metadata).toEqual({
      [BUNDLER_ID]: { version: ROLLIPOP_VERSION },
    });
  });
});
