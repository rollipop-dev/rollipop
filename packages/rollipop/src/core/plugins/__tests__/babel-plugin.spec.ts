import type * as rolldown from '@rollipop/rolldown';
import { id, include, interpreter } from '@rollipop/rolldown/filter';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import type { BundlerContext } from '../../types';
import { babel } from '../babel-plugin';
import { ROLLDOWN_RUNTIME_PATTERN } from '../shared/filters';
import { REVISION_KEY, TRANSFORM_FLAGS_KEY, TransformFlag } from '../utils/transform-utils';

const mocks = vi.hoisted(() => ({ transformSync: vi.fn() }));

vi.mock('@babel/core', () => ({ transformSync: mocks.transformSync }));

describe('babel', () => {
  beforeEach(() => {
    mocks.transformSync.mockReset().mockImplementation((code: string) => ({ code, map: null }));
  });

  it('does not register plugins without rules', () => {
    expect(babel({ context: createContext() })).toEqual([]);
    expect(babel({ context: createContext(), transformConfig: { rules: [] } })).toEqual([]);
  });

  it('registers only filtered transforms when all rules are standalone', () => {
    const filter = [include(id(/\.jsx$/))];
    const plugins = babel({
      context: createContext(),
      transformConfig: {
        rules: [{ filter, options: {}, standalone: true }],
      },
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual(['rollipop:babel-standalone-rule-0']);
    const composed = getTransform(plugins[0]!).filter;
    if (!Array.isArray(composed)) throw new Error('Expected composable filter');
    expect(interpreter(composed, '', '/src/input.jsx')).toBe(true);
    expect(interpreter(composed, '', '/src/input.js')).toBe(false);
    expect(filter).toEqual([include(id(/\.jsx$/))]);
  });

  it.each([true, false])(
    'excludes runtime modules before broad includes for standalone=%s',
    (standalone) => {
      const filter = [include(id(/.*/))];
      Object.freeze(filter);
      const plugins = babel({
        context: createContext(),
        transformConfig: { rules: [{ filter, options: {}, standalone }] },
      });

      for (const plugin of plugins) {
        const composed = getTransform(plugin).filter;
        if (!Array.isArray(composed)) throw new Error('Expected composable filter');
        expect(interpreter(composed, '', '/src/input.js')).toBe(true);
        expect(interpreter(composed, '', '/rolldown/runtime.js')).toBe(false);
        expect(interpreter(composed, '', '/node_modules/@oxc-project+runtime/index.js')).toBe(
          false,
        );
      }
      expect(filter).toEqual([include(id(/.*/))]);
    },
  );

  it.each([true, false])(
    'excludes runtime modules without a custom filter for standalone=%s',
    (standalone) => {
      const plugins = babel({
        context: createContext(),
        transformConfig: { rules: [{ options: {}, standalone }] },
      });

      for (const plugin of plugins) {
        const filter = getTransform(plugin).filter;
        if (!Array.isArray(filter)) throw new Error('Expected composable filter');
        expect(interpreter(filter, '', '/src/input.js')).toBe(true);
        expect(interpreter(filter, '', '/rolldown/runtime.js')).toBe(false);
        expect(interpreter(filter, '', '/node_modules/@oxc-project+runtime/index.js')).toBe(false);
      }
    },
  );

  it.each([true, false])(
    'preserves object filter conditions and exclusions for standalone=%s',
    (standalone) => {
      const filter: rolldown.HookFilter = {
        id: { include: /\.jsx?$/, exclude: [/ignored/] },
        code: { include: 'transformMe', exclude: /skipMe/ },
        moduleType: { include: ['js', 'jsx'] },
      };
      const original = structuredClone(filter);
      Object.freeze(filter);
      const plugins = babel({
        context: createContext(),
        transformConfig: { rules: [{ filter, options: {}, standalone }] },
      });

      expect(getTransform(plugins[0]!).filter).toEqual({
        ...original,
        id: { include: /\.jsx?$/, exclude: [ROLLDOWN_RUNTIME_PATTERN, /ignored/] },
      });
      expect(filter).toEqual(original);
    },
  );

  it('runs standalone rules in order before resolving and merging the remaining rules', async () => {
    mocks.transformSync.mockImplementation((code: string) => ({ code: `${code};`, map: null }));
    const standaloneOptions = vi.fn(() => ({ compact: true }));
    const mergedOptions = vi.fn(() => ({ plugins: ['second'], comments: false }));
    const plugins = babel({
      context: createContext(),
      transformConfig: {
        rules: [
          { options: { plugins: ['first'], comments: true } },
          { options: { presets: ['standalone'] }, standalone: true },
          { options: mergedOptions, standalone: false },
          { options: standaloneOptions, standalone: true },
        ],
      },
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'rollipop:babel-standalone-rule-1',
      'rollipop:babel-standalone-rule-3',
      'rollipop:babel-rule-0',
      'rollipop:babel-rule-2',
      'rollipop:babel',
    ]);

    let code = 'input';
    for (const plugin of plugins) {
      const result = await callTransform(plugin, code);
      if (result && typeof result === 'object' && result.code) {
        code = result.code.toString();
      }
    }

    expect(code).toBe('input;;;');
    expect(standaloneOptions).toHaveBeenCalledWith('input;', '/src/input.js');
    expect(mergedOptions).toHaveBeenCalledWith('input;;', '/src/input.js');
    expect(mocks.transformSync).toHaveBeenCalledTimes(3);
    expect(mocks.transformSync.mock.calls).toEqual([
      ['input', expect.objectContaining({ presets: ['standalone'] })],
      ['input;', expect.objectContaining({ compact: true })],
      ['input;;', expect.objectContaining({ plugins: ['first', 'second'], comments: false })],
    ]);
    expect(mocks.transformSync.mock.calls[2]![1]).not.toHaveProperty('presets');
    expect(mocks.transformSync.mock.calls[2]![1]).not.toHaveProperty('compact');
  });

  it.each([true, false])('preserves defaults for standalone=%s', async (standalone) => {
    const plugins = babel({
      context: createContext(),
      transformConfig: { rules: [{ options: {}, standalone }] },
    });

    for (const plugin of plugins) {
      await callTransform(plugin, 'input');
    }

    expect(mocks.transformSync).toHaveBeenCalledExactlyOnceWith('input', {
      filename: '/src/input.js',
      babelrc: false,
      configFile: false,
      sourceMaps: true,
    });
  });

  it('allows standalone options to override defaults', async () => {
    const plugins = babel({
      context: createContext(),
      transformConfig: {
        rules: [
          {
            options: { filename: '/custom.js', babelrc: true, sourceMaps: false },
            standalone: true,
          },
        ],
      },
    });

    await callTransform(plugins[0]!, 'input');

    expect(mocks.transformSync).toHaveBeenCalledExactlyOnceWith('input', {
      filename: '/custom.js',
      babelrc: true,
      configFile: false,
      sourceMaps: false,
    });
  });

  it.each([true, false])('respects SKIP_ALL for standalone=%s', async (standalone) => {
    const options = vi.fn(() => ({}));
    const plugins = babel({
      context: createContext(),
      transformConfig: { rules: [{ options, standalone }] },
    });

    for (const plugin of plugins) {
      expect(await callTransform(plugin, 'input', '/src/input.js', TransformFlag.SKIP_ALL)).toBe(
        undefined,
      );
    }

    expect(mocks.transformSync).not.toHaveBeenCalled();
    if (standalone) {
      expect(options).not.toHaveBeenCalled();
    }
  });

  it.each([true, false])(
    'returns mutable source map arrays for standalone=%s',
    async (standalone) => {
      const sourceMap = {
        version: 3,
        names: ['value'],
        sources: ['/src/input.js'],
        sourcesContent: ['input'],
        mappings: 'AAAA',
      };
      Object.freeze(sourceMap.names);
      Object.freeze(sourceMap.sources);
      Object.freeze(sourceMap.sourcesContent);
      mocks.transformSync.mockReturnValue({ code: 'output', map: sourceMap });
      const plugins = babel({
        context: createContext(),
        transformConfig: { rules: [{ options: {}, standalone }] },
      });

      let result;
      for (const plugin of plugins) {
        result = await callTransform(plugin, 'input');
      }

      expect(result).toEqual({ code: 'output', map: sourceMap });
      const { map } = result as { map: typeof sourceMap };
      expect(map).not.toBe(sourceMap);
      expect(map.names).not.toBe(sourceMap.names);
      expect(map.sources).not.toBe(sourceMap.sources);
      expect(map.sourcesContent).not.toBe(sourceMap.sourcesContent);
      map.names.push('other');
      map.sources.push('/src/other.js');
      map.sourcesContent.push('other');
      expect(sourceMap.names).toEqual(['value']);
    },
  );

  it('skips unmatched modules and clears merged options at build start', async () => {
    const [rule, aggregate] = babel({
      context: createContext(),
      transformConfig: { rules: [{ options: { comments: false } }] },
    });

    await callTransform(rule!, 'input');
    await callTransform(aggregate!, 'other', '/src/other.js');
    expect(mocks.transformSync).not.toHaveBeenCalled();

    const buildStart = aggregate!.buildStart!;
    const handler = typeof buildStart === 'function' ? buildStart : buildStart.handler;
    await handler.call(createPluginContext(), {} as rolldown.NormalizedInputOptions);
    await callTransform(aggregate!, 'input');
    expect(mocks.transformSync).not.toHaveBeenCalled();
  });
});

function createContext(): BundlerContext {
  return {
    id: 'test-bundler',
    root: '/test',
    buildType: 'serve',
    storage: {} as BundlerContext['storage'],
    eventBus: new EventBus(),
    state: { revision: 1, latestBuildStartTime: 0 },
  };
}

function createPluginContext(flag = TransformFlag.NONE) {
  return {
    getModuleInfo: () => ({
      meta: { [REVISION_KEY]: 1, [TRANSFORM_FLAGS_KEY]: flag },
    }),
  } as unknown as rolldown.TransformPluginContext;
}

function getTransform(plugin: rolldown.Plugin) {
  const transform = plugin.transform;
  if (!transform || typeof transform === 'function') {
    throw new Error(`Expected an object transform hook on ${plugin.name}`);
  }
  return transform;
}

async function callTransform(
  plugin: rolldown.Plugin,
  code: string,
  id = '/src/input.js',
  flag = TransformFlag.NONE,
) {
  return getTransform(plugin).handler.call(createPluginContext(flag), code, id, {
    moduleType: 'js',
  });
}
