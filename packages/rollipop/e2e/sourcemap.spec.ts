import { types } from '@babel/core';
import { describe, expect, it, vi } from 'vite-plus/test';

import { evaluateContext } from '../src/testing/evaluate-context';
import { build, type TestConfigOptions } from './helpers';
import { buildWithReactRefresh, expectMappedError } from './sourcemap-helpers';

const fixture = 'transformer/sourcemap';

describe.each([
  { name: 'development', mode: 'development', dev: true, minify: false, refresh: false },
  { name: 'production', mode: 'production', dev: false, minify: true, refresh: false },
  { name: 'React Refresh', mode: 'development', dev: true, minify: false, refresh: true },
] as const)('general sourcemaps in $name builds', ({ mode, dev, minify, refresh }) => {
  it.each([
    { name: 'plain JavaScript', source: 'plain.js', message: 'plain JavaScript failure' },
    { name: 'TypeScript private fields', source: 'class.ts', message: 'private field failure' },
    { name: 'Flow annotations', source: 'flow.js', message: 'Flow failure' },
    { name: 'async functions after await', source: 'async.ts', message: 'async failure' },
  ])('maps $name when React Compiler skips non-components', async ({ source, message }) => {
    const options: TestConfigOptions = {
      entry: source,
      mode,
      transform: {
        jsx: { compiler: {} },
        target: source === 'class.ts' ? 'es2015' : undefined,
      },
    };
    const chunk = refresh
      ? await buildWithReactRefresh(fixture, options)
      : await build(fixture, options, { dev, minify, sourcemap: true });

    expect(Object.keys(chunk.modules).some((id) => id.includes('compiler-runtime'))).toBe(false);
    if (source === 'class.ts') {
      expect(chunk.code).not.toMatch(/\.\s*#[\w$]+|^\s*#[\w$]+/m);
      expect(chunk.code).not.toContain(': boolean');
    } else if (source === 'flow.js') {
      expect(chunk.code).not.toContain('type Options');
      expect(chunk.code).not.toContain(': Options');
    }

    const context = evaluateContext({
      __ReactRefresh: {
        register: vi.fn(),
        createSignatureFunctionForTransform: () => (type: unknown) => type,
      },
    });
    await expectMappedError(chunk, { fixture, source, message }, () =>
      context.evaluate(`${chunk.code}\nglobalThis.runSourcemapCase();`),
    );
    if (refresh) {
      expect(context.evaluate('globalThis.__rollipop_runtime__.graphs.size')).toBe(1);
    }
  });

  it('preserves original locations through subsequent Babel and SWC rules', async () => {
    const source = 'chained.ts';
    let swcInput = '';
    const options: TestConfigOptions = {
      entry: source,
      mode,
      transform: {
        jsx: { compiler: {} },
        babel: {
          rules: [
            {
              filter: { id: /sourcemap\/chained\.ts$/ },
              options: {
                compact: true,
                plugins: [
                  function (): import('@babel/core').PluginObject {
                    return {
                      visitor: {
                        Program(path) {
                          path.unshiftContainer(
                            'body',
                            types.expressionStatement(
                              types.callExpression(types.identifier('recordTransform'), [
                                types.stringLiteral('babel-rule'),
                              ]),
                            ),
                          );
                        },
                      },
                    };
                  },
                ],
              },
            },
          ],
        },
        swc: {
          rules: [
            {
              filter: { id: /sourcemap\/chained\.ts$/ },
              options(code) {
                swcInput = code;
                return {
                  jsc: {
                    transform: {
                      optimizer: {
                        globals: { vars: { __SOURCEMAP_RULE__: '"swc-rule"' } },
                      },
                    },
                  },
                };
              },
            },
          ],
        },
      },
    };
    const chunk = refresh
      ? await buildWithReactRefresh(fixture, options)
      : await build(fixture, options, { dev, minify, sourcemap: true });

    // Babel moves the throw onto one line before SWC emits another source map.
    expect(swcInput.split('\n')).toHaveLength(1);
    expect(swcInput).toContain('recordTransform("babel-rule")');
    expect(swcInput).toContain('__SOURCEMAP_RULE__');
    expect(chunk.code).not.toContain('__SOURCEMAP_RULE__');

    const events: string[] = [];
    const context = evaluateContext({
      recordTransform: (value: string) => events.push(value),
      __ReactRefresh: {
        register: vi.fn(),
        createSignatureFunctionForTransform: () => (type: unknown) => type,
      },
    });
    await expectMappedError(chunk, { fixture, source, message: 'chained transform failure' }, () =>
      context.evaluate(`${chunk.code}\nglobalThis.runSourcemapCase();`),
    );
    expect(events).toEqual(['babel-rule', 'swc-rule']);
    if (refresh) {
      expect(context.evaluate('globalThis.__rollipop_runtime__.graphs.size')).toBe(1);
    }
  });
});
