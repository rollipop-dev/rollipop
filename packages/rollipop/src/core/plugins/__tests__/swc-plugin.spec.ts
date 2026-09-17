import type * as rolldown from '@rollipop/rolldown';
import { exclude, id, include, interpreter } from '@rollipop/rolldown/filter';
import { transformSync } from '@swc/core';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { TransformRule } from '../../../config';
import type { BundlerContext } from '../../types';
import { ROLLDOWN_RUNTIME_PATTERN } from '../shared/filters';
import { swc } from '../swc-plugin';
import { REVISION_KEY, TRANSFORM_FLAGS_KEY, TransformFlag } from '../utils/transform-utils';

vi.mock('@swc/core', () => ({ transformSync: vi.fn() }));

const context = { state: { revision: 1 } } as BundlerContext;
const moduleId = '/project/app.js';

type TransformHook = {
  filter?: TransformRule['filter'];
  handler: (
    this: rolldown.TransformPluginContext,
    code: string,
    id: string,
  ) => { code: string; map?: string } | undefined;
};

function transformHook(plugin: rolldown.Plugin): TransformHook {
  return plugin.transform as TransformHook;
}

function pluginContext(flag = TransformFlag.NONE): rolldown.TransformPluginContext {
  return {
    getModuleInfo: () => ({
      meta: { [TRANSFORM_FLAGS_KEY]: flag, [REVISION_KEY]: 1 },
    }),
  } as unknown as rolldown.TransformPluginContext;
}

describe('swc plugin', () => {
  beforeEach(() => {
    vi.mocked(transformSync).mockReset();
    vi.mocked(transformSync).mockImplementation((code) => {
      if (typeof code !== 'string') throw new Error('Expected source code');
      return { code: `${code};`, map: 'source-map' };
    });
  });

  it.each([undefined, {}, { rules: [] }])(
    'registers only helper resolution without rules: %j',
    (config) => {
      const plugins = swc({ context, transformConfig: config });

      expect(plugins.map((plugin) => plugin.name)).toEqual(['rollipop:swc-helpers-resolve']);
      expect(plugins[0]?.resolveId).toBeDefined();
      expect(plugins[0]?.transform).toBeUndefined();
    },
  );

  it('keeps helper resolution and omits the merged hook for standalone rules', () => {
    const plugins = swc({
      context,
      transformConfig: { rules: [{ standalone: true, options: {} }] },
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'rollipop:swc-helpers-resolve',
      'rollipop:swc-standalone-rule-0',
    ]);
    expect(plugins[0]?.resolveId).toBeDefined();
  });

  it('resolves standalone options immediately and returns the compiler output and map', () => {
    const options = vi.fn(() => ({ minify: true }));
    const plugins = swc({
      context,
      transformConfig: { rules: [{ standalone: true, options }] },
    });

    const result = transformHook(plugins[1]!).handler.call(pluginContext(), 'input', moduleId);

    expect(options).toHaveBeenCalledExactlyOnceWith('input', moduleId);
    expect(transformSync).toHaveBeenCalledExactlyOnceWith('input', {
      filename: moduleId,
      configFile: false,
      swcrc: false,
      sourceMaps: true,
      inputSourceMap: false,
      minify: true,
    });
    expect(result).toEqual({ code: 'input;', map: 'source-map' });
  });

  it('runs standalone rules in order before collecting and merging ordinary rules', () => {
    const options = vi.fn(() => ({ jsc: { target: 'es2020' as const } }));
    const plugins = swc({
      context,
      transformConfig: {
        rules: [
          { options },
          { standalone: true, options: { minify: true } },
          { standalone: false, options: { jsc: { parser: { syntax: 'ecmascript' } } } },
          { standalone: true, options: { sourceMaps: false } },
        ],
      },
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'rollipop:swc-helpers-resolve',
      'rollipop:swc-standalone-rule-1',
      'rollipop:swc-standalone-rule-3',
      'rollipop:swc-rule-0',
      'rollipop:swc-rule-2',
      'rollipop:swc',
    ]);
    let code = 'input';
    for (const plugin of plugins.slice(1)) {
      const result = transformHook(plugin).handler.call(pluginContext(), code, moduleId);
      code = result?.code ?? code;
    }

    expect(code).toBe('input;;;');
    expect(options).toHaveBeenCalledExactlyOnceWith('input;;', moduleId);
    expect(transformSync).toHaveBeenCalledTimes(3);
    expect(transformSync).toHaveBeenNthCalledWith(
      1,
      'input',
      expect.objectContaining({ minify: true }),
    );
    expect(transformSync).toHaveBeenNthCalledWith(
      2,
      'input;',
      expect.objectContaining({ sourceMaps: false }),
    );
    expect(vi.mocked(transformSync).mock.calls[2]).toEqual([
      'input;;',
      {
        filename: moduleId,
        configFile: false,
        swcrc: false,
        sourceMaps: true,
        inputSourceMap: false,
        jsc: { target: 'es2020', parser: { syntax: 'ecmascript' } },
      },
    ]);
  });

  it('retains per-module collection and clears ordinary rules on a new build', () => {
    const plugins = swc({ context, transformConfig: { rules: [{ options: {} }] } });
    const collect = transformHook(plugins[1]!);
    const merged = plugins[2]!;
    const transform = transformHook(merged);
    const ctx = pluginContext();

    expect(collect.handler.call(ctx, 'input', moduleId)).toBeUndefined();
    expect(transform.handler.call(ctx, 'other', '/project/other.js')).toBeUndefined();
    expect(transformSync).not.toHaveBeenCalled();
    expect(transform.handler.call(ctx, 'input', moduleId)).toEqual({
      code: 'input;',
      map: 'source-map',
    });

    (merged.buildStart as () => void)();
    expect(transform.handler.call(ctx, 'input', moduleId)).toBeUndefined();
    expect(transformSync).toHaveBeenCalledTimes(1);
  });

  it('skips standalone option resolution and compilation for SKIP_ALL modules', () => {
    const options = vi.fn(() => ({}));
    const plugins = swc({
      context,
      transformConfig: { rules: [{ standalone: true, options }] },
    });

    expect(
      transformHook(plugins[1]!).handler.call(
        pluginContext(TransformFlag.SKIP_ALL),
        'input',
        moduleId,
      ),
    ).toBeUndefined();
    expect(options).not.toHaveBeenCalled();
    expect(transformSync).not.toHaveBeenCalled();
  });

  it('excludes runtime modules before matching composable includes without mutating the filter', () => {
    const filter = [include(id(/\.js$/)), exclude(id(/ignored/))];
    const original = [...filter];
    Object.freeze(filter);
    const plugins = swc({
      context,
      transformConfig: { rules: [{ standalone: true, filter, options: {} }] },
    });
    const composed = transformHook(plugins[1]!).filter;

    expect(Array.isArray(composed)).toBe(true);
    if (!Array.isArray(composed)) throw new Error('Expected composable filter');
    expect(interpreter(composed, '', moduleId)).toBe(true);
    expect(interpreter(composed, '', '/rolldown/runtime.js')).toBe(false);
    expect(interpreter(composed, '', '/node_modules/@oxc-project+runtime/index.js')).toBe(false);
    expect(interpreter(composed, '', '/project/app.ts')).toBe(false);
    expect(composed.slice(1)).toEqual(original);
    expect(filter).toEqual(original);
  });

  it.each([true, false])(
    'excludes runtime modules from every transform hook with standalone=%s',
    (standalone) => {
      const plugins = swc({
        context,
        transformConfig: { rules: [{ standalone, options: {} }] },
      });

      for (const plugin of plugins.slice(1)) {
        const filter = transformHook(plugin).filter;
        if (!Array.isArray(filter)) throw new Error('Expected composable filter');

        expect(interpreter(filter, '', moduleId)).toBe(true);
        expect(interpreter(filter, '', '/rolldown/runtime.js')).toBe(false);
        expect(interpreter(filter, '', '/node_modules/@oxc-project+runtime/index.js')).toBe(false);
      }
    },
  );

  it.each<{
    name: string;
    idFilter?: rolldown.HookFilter['id'];
    includes?: string | RegExp | (string | RegExp)[];
    excludes: (string | RegExp)[];
  }>([
    { name: 'absent id', excludes: [] },
    { name: 'string', idFilter: '**/*.js', includes: '**/*.js', excludes: [] },
    { name: 'regexp', idFilter: /\.js$/, includes: /\.js$/, excludes: [] },
    { name: 'array', idFilter: ['**/*.js', /\.ts$/], includes: ['**/*.js', /\.ts$/], excludes: [] },
    {
      name: 'formal single exclusion',
      idFilter: { include: /\.js$/, exclude: /ignored/ },
      includes: /\.js$/,
      excludes: [/ignored/],
    },
    {
      name: 'formal exclusion array',
      idFilter: { include: ['**/*.js'], exclude: [/ignored/, '**/vendor/**'] },
      includes: ['**/*.js'],
      excludes: [/ignored/, '**/vendor/**'],
    },
  ])(
    'preserves object filters with $name while adding runtime exclusions',
    ({ idFilter, includes, excludes }) => {
      const filter: rolldown.HookFilter = {
        id: idFilter,
        code: { include: 'transformMe', exclude: /skipMe/ },
        moduleType: { include: ['js', 'jsx'] },
      };
      const original = structuredClone(filter);
      Object.freeze(filter);
      const plugins = swc({
        context,
        transformConfig: { rules: [{ standalone: true, filter, options: {} }] },
      });
      const composed = transformHook(plugins[1]!).filter as rolldown.HookFilter;

      expect(composed).toEqual({
        ...original,
        id: {
          ...(includes === undefined ? {} : { include: includes }),
          exclude: [ROLLDOWN_RUNTIME_PATTERN, ...excludes],
        },
      });
      expect(composed).not.toBe(filter);
      expect(filter).toEqual(original);
    },
  );
});
