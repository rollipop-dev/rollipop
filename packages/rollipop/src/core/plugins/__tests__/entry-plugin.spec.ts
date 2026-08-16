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
    const preludePath = path.join('/project', 'prelude.js');
    const plugin = entry({
      id: BUNDLER_ID,
      entryPath,
      preludePaths: [preludePath],
    })[0]!;
    const resolveId = plugin.resolveId as (source: string) => { id: string } | null;

    // The virtual entry id resolves to itself.
    expect(resolveId(ROLLIPOP_VIRTUAL_ENTRY_ID)).toEqual({ id: ROLLIPOP_VIRTUAL_ENTRY_ID });
    // Absolute entry/prelude paths (emitted into the virtual entry) resolve to
    // themselves so the default resolver doesn't choke on them.
    expect(resolveId(entryPath)).toEqual({ id: entryPath });
    expect(resolveId(preludePath)).toEqual({ id: preludePath });
    // Unrelated ids are not intercepted.
    expect(resolveId('/some/other/module.js')).toBeNull();
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
    const metadata = evaluateContext({
      __rollipop_require__: (() => {
        const modules: Record<string, unknown> = {};
        const fn = ((id: string) => {
          if (id in modules) return modules[id];
          throw new Error(`Cannot require "${id}" in test vm`);
        }) as unknown as ((id: string) => unknown) & {
          m: Record<string, unknown>;
          e: (s: string) => unknown;
        };
        fn.m = modules;
        fn.e = (s: string) => fn(s);
        return fn;
      })(),
    }).evaluate(`${result.code}\nglobalThis.__rollipop_meta__;`);

    expect(result.moduleType).toBe('js');
    expect(metadata).toEqual({
      [BUNDLER_ID]: { version: ROLLIPOP_VERSION },
    });
  });
});
