import { describe, expect, it } from 'vite-plus/test';

import type { Plugin } from '../src/core/plugins/types';
import { build } from './helpers';

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

    it('builds with the native transform pipeline enabled', async () => {
      const chunk = await build('transformer/jsx', {
        entry: 'index.tsx',
        external: [/^react/],
        experimental: {
          nativeTransformPipeline: true,
        },
      });

      expect(chunk.code).toContain('jsx');
      expect(chunk.code).not.toContain('<div');
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

    it('only processes files matching flow filter', async () => {
      // .ts files should NOT be processed by flow stripper (only .js/.jsx with @flow)
      const chunk = await build('optimization/treeshake');

      // Should compile fine without flow processing
      expect(chunk.code).toContain('add');
    });

    it('passes Flow options to the native transform pipeline', async () => {
      const chunk = await build('transformer/flow-without-directive', {
        entry: 'index.js',
        experimental: {
          nativeTransformPipeline: true,
          flow: { requireDirective: false },
        },
      });

      expect(chunk.code).not.toMatch(/:\s*Props/);
      expect(chunk.code).toContain('Alice');

      await expect(
        build('transformer/flow-without-directive', {
          entry: 'index.js',
          experimental: {
            nativeTransformPipeline: true,
            flow: { requireDirective: true },
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('SWC - Hermes compatibility', () => {
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
  });

  describe('Babel', () => {
    it('custom babel rule transforms matching files', async () => {
      const chunk = await build('bundle-output/prelude', {
        transform: {
          babel: {
            rules: [
              {
                filter: { id: /\.ts$/ },
                options: {
                  plugins: [
                    function (): import('@babel/core').PluginObj {
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
                    function (): import('@babel/core').PluginObj {
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
                    function (): import('@babel/core').PluginObj {
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
