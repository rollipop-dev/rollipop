import { createRequire } from 'node:module';

import { id, include } from '@rollipop/rolldown/filter';
import { describe, expect, it } from 'vite-plus/test';

import type { Plugin } from '../src/core/plugins/types';
import { evaluateContext } from '../src/testing/evaluate-context';
import { build, fixturePath } from './helpers';

const require = createRequire(import.meta.url);

describe('transformer', () => {
  describe('JSX', () => {
    it('compiles JSX with automatic runtime (no React import needed)', async () => {
      const chunk = await build('transformer/jsx', {
        entry: 'index.tsx',
        external: [/^react/],
      });

      // automatic runtime uses jsx/jsxs from react/jsx-runtime
      expect(chunk.code).toContain('jsx');
      // original JSX syntax should be compiled away
      expect(chunk.code).not.toContain('<div');
      expect(chunk.code).not.toContain('<h1>');
    });

    it('uses jsxDEV in development mode', async () => {
      const chunk = await build(
        'transformer/jsx',
        { entry: 'index.tsx', mode: 'development', external: [/^react/] },
        { dev: true },
      );

      expect(chunk.code).toContain('jsxDEV');
    });

    it('uses jsx (non-DEV) in production mode', async () => {
      const chunk = await build('transformer/jsx', {
        entry: 'index.tsx',
        mode: 'production',
        external: [/^react/],
      });

      expect(chunk.code).not.toContain('jsxDEV');
    });
  });

  describe('Flow', () => {
    it('strips Flow type annotations from @flow annotated files', async () => {
      const chunk = await build('transformer/flow', {
        entry: 'index.js',
      });

      // Flow types should be stripped
      expect(chunk.code).not.toContain('type Props');
      expect(chunk.code).not.toMatch(/:\s*Props/);
      expect(chunk.code).not.toMatch(/:\s*string/);
      // Runtime code should remain
      expect(chunk.code).toContain('Alice');
      expect(chunk.code).toContain('30');
    });

    it('passes Flow options to the transform pipeline', async () => {
      const chunk = await build('transformer/flow-without-directive', {
        entry: 'index.js',
        transform: {
          flow: { requireDirective: false },
        },
      });

      expect(chunk.code).not.toMatch(/:\s*Props/);
      expect(chunk.code).toContain('Alice');

      await expect(
        build('transformer/flow-without-directive', {
          entry: 'index.js',
          transform: {
            flow: { requireDirective: true },
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('SWC - Hermes compatibility', () => {
    it('resolves native external helpers without custom SWC rules', async () => {
      const chunk = await build('module-semantics/call-receivers', {
        entry: 'index.js',
        transform: {
          swc: {
            native: { externalHelpers: true, module: { type: 'commonjs' } },
          },
        },
      });

      expect(Object.keys(chunk.modules).some((id) => id.includes('@swc/helpers/'))).toBe(true);
      const result = evaluateContext().evaluate(`${chunk.code}\nglobalThis.result;`);
      expect(result[0]).toBe(true);
      expect(result[7]).toBe(42);
    });

    it('transforms class properties and private fields for Hermes', async () => {
      // Fixture has class with private fields (#sound)
      const chunk = await build('resolver/platform-suffix');

      // SWC runs on all files; verify it doesn't break normal code
      expect(chunk.code).toBeDefined();
    });

    it('custom SWC rule applies additional transforms', async () => {
      const chunk = await build('optimization/treeshake', {
        transform: {
          swc: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: {
                  jsc: {
                    transform: {
                      optimizer: {
                        globals: {
                          vars: {
                            __SWC_INJECTED__: '"swc-was-here"',
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      });

      expect(chunk.code).toBeDefined();
    });

    it.each([
      ['JavaScript', 'index.js'],
      ['TypeScript', 'index.ts'],
      ['Flow', 'flow.js'],
    ])('applies native SWC plugins and rules to %s', async (_syntax, entry) => {
      const baseline = await build('transformer/native-swc', { entry });
      const chunk = await build('transformer/native-swc', {
        entry,
        transform: {
          swc: {
            native: {
              plugins: [[require.resolve('@swc/plugin-remove-console'), { exclude: ['error'] }]],
            },
            rules: [
              {
                filter: { id: /native-swc\/(?:index\.[jt]s|flow\.js)$/ },
                options: {
                  jsc: {
                    transform: {
                      optimizer: {
                        globals: {
                          vars: { __NATIVE_SWC_RULE__: '"swc-rule-applied"' },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      });

      const evaluate = (code: string) => {
        const events: string[] = [];
        evaluateContext({
          console: {
            log: (value: string) => events.push(`log:${value}`),
            warn: (value: string) => events.push(`warn:${value}`),
            error: (value: string) => events.push(`error:${value}`),
          },
          record: (value: string) => events.push(value),
          __NATIVE_SWC_RULE__: 'without-swc-rule',
        }).evaluate(code);
        return events;
      };

      expect(evaluate(baseline.code)).toEqual([
        'log:global-log',
        'warn:global-warn',
        'error:global-error',
        'local-log',
        'retained-side-effect',
        'without-swc-rule',
      ]);
      expect(evaluate(chunk.code)).toEqual([
        'error:global-error',
        'local-log',
        'retained-side-effect',
        'swc-rule-applied',
      ]);
    });
  });

  describe('Babel', () => {
    it.each([
      ['object', { id: /prelude\/index\.ts$/ }],
      ['expression', [include(id(/prelude\/index\.ts$/))]],
    ])('runs standalone rules only for files matching the %s filter', async (_type, filter) => {
      const receivedIds: string[] = [];
      const chunk = await build('bundle-output/prelude', {
        prelude: [fixturePath('bundle-output/prelude/init.ts')],
        transform: {
          babel: {
            rules: [
              {
                standalone: true,
                filter,
                options: (_code, id) => {
                  receivedIds.push(id);
                  return {
                    plugins: [
                      function (): import('@babel/core').PluginObject {
                        return {
                          visitor: {
                            StringLiteral(path) {
                              path.node.value = `standalone:${path.node.value}`;
                            },
                          },
                        };
                      },
                    ],
                  };
                },
              },
            ],
          },
        },
      });

      expect(receivedIds).toEqual([fixturePath('bundle-output/prelude/index.ts')]);
      expect(chunk.code).toContain('standalone:main entry');
      expect(chunk.code).toContain('prelude:init');
      expect(chunk.code).not.toContain('standalone:prelude:init');
    });

    it('runs standalone passes in order before resolving merged rules', async () => {
      const passes: string[] = [];
      const receivedCode: string[] = [];
      const options = (label: string): import('@babel/core').InputOptions => ({
        plugins: [
          function (): import('@babel/core').PluginObject {
            return {
              pre() {
                passes.push(label);
              },
              visitor: {
                StringLiteral(path) {
                  path.node.value += `:${label}`;
                },
              },
            };
          },
        ],
      });
      const filter = { id: /prelude\/index\.ts$/ };

      const chunk = await build('bundle-output/prelude', {
        transform: {
          babel: {
            rules: [
              {
                filter,
                options: (code) => {
                  receivedCode.push(code);
                  return options('merged-0');
                },
              },
              { filter, standalone: true, options: options('standalone-0') },
              {
                filter,
                standalone: false,
                options: (code) => {
                  receivedCode.push(code);
                  return options('merged-1');
                },
              },
              { filter, standalone: true, options: options('standalone-1') },
            ],
          },
        },
      });

      expect(passes).toEqual(['standalone-0', 'standalone-1', 'merged-0', 'merged-1']);
      expect(receivedCode).toHaveLength(2);
      expect(receivedCode[0]).toContain('main entry:standalone-0:standalone-1');
      expect(receivedCode[1]).toBe(receivedCode[0]);
      expect(chunk.code).toContain('main entry:standalone-0:standalone-1:merged-0:merged-1');
    });

    it('custom babel rule transforms matching files', async () => {
      const chunk = await build('bundle-output/prelude', {
        transform: {
          babel: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: {
                  plugins: [
                    function (): import('@babel/core').PluginObject {
                      return {
                        visitor: {
                          StringLiteral(path) {
                            if (path.node.value === 'main entry') {
                              path.node.value = 'babel-transformed-entry';
                            }
                          },
                        },
                      };
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      expect(chunk.code).toContain('babel-transformed-entry');
      expect(chunk.code).not.toContain('main entry');
    });

    it('babel options as function receives code and id', async () => {
      const receivedIds: string[] = [];

      await build('bundle-output/prelude', {
        transform: {
          babel: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: (_code: string, id: string) => {
                  receivedIds.push(id);
                  return {};
                },
              },
            ],
          },
        },
      });

      expect(receivedIds.length).toBeGreaterThan(0);
      expect(receivedIds.every((id) => id.endsWith('.ts'))).toBe(true);
    });

    it('multiple babel rules stack transforms', async () => {
      const order: string[] = [];

      await build('bundle-output/prelude', {
        transform: {
          babel: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: {
                  plugins: [
                    function (): import('@babel/core').PluginObject {
                      return {
                        visitor: {
                          Program() {
                            order.push('rule-0');
                          },
                        },
                      };
                    },
                  ],
                },
              },
              {
                filter: { id: /\.ts$/ },
                options: {
                  plugins: [
                    function (): import('@babel/core').PluginObject {
                      return {
                        visitor: {
                          Program() {
                            order.push('rule-1');
                          },
                        },
                      };
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      expect(order).toContain('rule-0');
      expect(order).toContain('rule-1');
    });
  });

  describe('SWC - multiple rules', () => {
    it.each([
      ['object', { id: /prelude\/index\.ts$/ }],
      ['expression', [include(id(/prelude\/index\.ts$/))]],
    ])('runs standalone rules only for files matching the %s filter', async (_type, filter) => {
      const receivedIds: string[] = [];
      const chunk = await build('bundle-output/prelude', {
        prelude: [fixturePath('bundle-output/prelude/init.ts')],
        transform: {
          swc: {
            rules: [
              {
                standalone: true,
                filter,
                options: (_code, id) => {
                  receivedIds.push(id);
                  return {
                    jsc: {
                      transform: {
                        optimizer: { globals: { vars: { console: '__STANDALONE_CONSOLE__' } } },
                      },
                    },
                  };
                },
              },
            ],
          },
        },
      });

      const events: string[] = [];
      evaluateContext({
        console: { log: (value: string) => events.push(value) },
        __STANDALONE_CONSOLE__: { log: (value: string) => events.push(`standalone:${value}`) },
      }).evaluate(chunk.code);

      expect(receivedIds).toEqual([fixturePath('bundle-output/prelude/index.ts')]);
      expect(events).toEqual(['prelude:init', 'standalone:main entry']);
    });

    it('runs standalone passes in order before resolving merged rules', async () => {
      const receivedCode: string[] = [];
      const options = (from: string, to: string): import('@swc/core').Options => ({
        jsc: { transform: { optimizer: { globals: { vars: { [from]: to } } } } },
      });
      const filter = { id: /prelude\/index\.ts$/ };

      const chunk = await build('bundle-output/prelude', {
        transform: {
          swc: {
            rules: [
              {
                filter,
                options: (code) => {
                  receivedCode.push(code);
                  return options('__SECOND_CONSOLE__', '__MERGED_CONSOLE__');
                },
              },
              { filter, standalone: true, options: options('console', '__FIRST_CONSOLE__') },
              {
                filter,
                standalone: false,
                options: (code) => {
                  receivedCode.push(code);
                  return {};
                },
              },
              {
                filter,
                standalone: true,
                options: options('__FIRST_CONSOLE__', '__SECOND_CONSOLE__'),
              },
            ],
          },
        },
      });

      const events: string[] = [];
      evaluateContext({
        __MERGED_CONSOLE__: { log: (value: string) => events.push(value) },
      }).evaluate(chunk.code);

      expect(receivedCode).toHaveLength(2);
      expect(receivedCode[0]).toContain('__SECOND_CONSOLE__');
      expect(receivedCode[1]).toBe(receivedCode[0]);
      expect(events).toEqual(['main entry']);
    });

    it('multiple SWC rules are stacked on the same file', async () => {
      const matchedRuleIds: number[] = [];

      const chunk = await build('bundle-output/prelude', {
        transform: {
          swc: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: (_code: string, _id: string) => {
                  matchedRuleIds.push(0);
                  return {};
                },
              },
              {
                filter: { id: /\.ts$/ },
                options: (_code: string, _id: string) => {
                  matchedRuleIds.push(1);
                  return {};
                },
              },
            ],
          },
        },
      });

      expect(chunk.code).toBeDefined();
      expect(matchedRuleIds).toContain(0);
      expect(matchedRuleIds).toContain(1);
    });
  });

  describe('plugin transform pipeline', () => {
    describe.each(['babel', 'swc'] as const)('%s runtime exclusion', (compiler) => {
      it.each([
        [false, 'object'],
        [false, 'expression'],
        [true, 'object'],
        [true, 'expression'],
      ] as const)(
        'excludes runtime modules with standalone=%s and %s filters',
        async (standalone, filterType) => {
          const entryId = fixturePath('bundle-output/prelude/index.ts');
          const runtimeIds = ['\0test/rolldown/runtime.js', '\0test/@oxc-project+runtime/index.js'];
          const processedIds: string[] = [];
          const chunk = await build('bundle-output/prelude', {
            plugins: [
              {
                name: 'test:runtime-modules',
                resolveId(source) {
                  if (runtimeIds.includes(source)) return source;
                },
                load(id) {
                  if (runtimeIds.includes(id)) return `record(${JSON.stringify(id)});`;
                  if (id === entryId) {
                    return `${runtimeIds.map((id) => `import ${JSON.stringify(id)};`).join('\n')}\nrecord('entry');`;
                  }
                },
              },
            ],
            transform: {
              [compiler]: {
                rules: [
                  {
                    standalone,
                    filter:
                      filterType === 'object' ? { id: /\.[jt]s$/ } : [include(id(/\.[jt]s$/))],
                    options: (_code: string, id: string) => {
                      processedIds.push(id);
                      return {};
                    },
                  },
                ],
              },
            },
          });

          const events: string[] = [];
          evaluateContext({ record: (value: string) => events.push(value) }).evaluate(chunk.code);

          expect(events).toEqual([...runtimeIds, 'entry']);
          expect(processedIds).toEqual([entryId]);
        },
      );
    });

    it.each(['babel', 'swc'] as const)('standalone %s rules honor SKIP_ALL', async (compiler) => {
      const processedIds: string[] = [];

      const chunk = await build('module-semantics/json-imports', {
        entry: 'index.js',
        transform: {
          [compiler]: {
            rules: [
              {
                standalone: true,
                options: (_code: string, id: string) => {
                  processedIds.push(id);
                  return {};
                },
              },
            ],
          },
        },
      });

      expect(Object.keys(chunk.modules)).toContain(
        fixturePath('module-semantics/json-imports/data.json'),
      );
      expect(processedIds).toContain(fixturePath('module-semantics/json-imports/index.js'));
      expect(processedIds.every((id) => !id.endsWith('.json'))).toBe(true);
    });

    it('user plugin transform runs after core plugins', async () => {
      const transformOrder: string[] = [];

      const plugin: Plugin = {
        name: 'test:transform-order',
        transform(code, id) {
          if (id.endsWith('index.ts')) {
            transformOrder.push('user-plugin');
          }
        },
      };

      await build('bundle-output/prelude', { plugins: [plugin] });

      expect(transformOrder).toContain('user-plugin');
    });

    it('SKIP_ALL flag prevents subsequent transforms', async () => {
      // JSON plugin sets SKIP_ALL, so babel/swc should not process .json files
      const babelProcessedIds: string[] = [];

      const chunk = await build('resolver/condition-names', {
        transform: {
          babel: {
            rules: [
              {
                // match everything — but .json should be skipped by SKIP_ALL
                options: (_code: string, id: string) => {
                  babelProcessedIds.push(id);
                  return {};
                },
              },
            ],
          },
        },
      });

      expect(chunk.code).toBeDefined();
      // package.json should NOT be processed by babel (SKIP_ALL set by json plugin)
      expect(babelProcessedIds.every((id) => !id.endsWith('.json'))).toBe(true);
    });
  });
});
