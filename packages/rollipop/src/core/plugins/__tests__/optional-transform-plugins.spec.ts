import { build } from '@rollipop/rolldown';
import { describe, expect, it } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import type { BundlerContext } from '../../types';
import { babel } from '../babel-plugin';
import { swc } from '../swc-plugin';

const context: BundlerContext = {
  id: 'optional-transform-test',
  root: '/test',
  buildType: 'build',
  storage: {} as BundlerContext['storage'],
  eventBus: new EventBus(),
  state: { revision: 1, latestBuildStartTime: 0 },
};

describe('optional transform plugins', () => {
  it.each([undefined, {}, { rules: [] }])('omits empty Babel transforms: %j', (transformConfig) => {
    expect(babel({ context, transformConfig })).toEqual([]);
  });

  it.each([undefined, {}, { rules: [] }, { native: { plugins: [] } }])(
    'omits empty SWC JS transforms but preserves helper resolution: %j',
    (transformConfig) => {
      const plugins = swc({ context, transformConfig });
      expect(plugins.map((plugin) => plugin.name)).toEqual(['rollipop:swc-helpers-resolve']);
      expect(plugins[0]?.resolveId).toBeDefined();
      expect(plugins.every((plugin) => plugin.transform == null)).toBe(true);
    },
  );

  it('retains configured Babel and SWC transform pipelines', () => {
    const transformConfig = { rules: [{ filter: { id: /\.tsx?$/ }, options: {} }] };
    expect(babel({ context, transformConfig }).map((plugin) => plugin.name)).toEqual([
      'rollipop:babel-rule-0',
      'rollipop:babel',
    ]);
    expect(swc({ context, transformConfig }).map((plugin) => plugin.name)).toEqual([
      'rollipop:swc-helpers-resolve',
      'rollipop:swc-rule-0',
      'rollipop:swc',
    ]);
  });

  it.each(['babel', 'swc'] as const)('still applies configured %s rules', async (compiler) => {
    const filter = { id: /entry\.ts$/ };
    const plugins =
      compiler === 'babel'
        ? babel({
            context,
            transformConfig: {
              rules: [
                {
                  filter,
                  options: {
                    plugins: [
                      () => ({
                        visitor: {
                          NumericLiteral(path) {
                            path.node.value = 42;
                          },
                        },
                      }),
                    ],
                  },
                },
              ],
            },
          })
        : swc({
            context,
            transformConfig: {
              rules: [
                {
                  filter,
                  options: {
                    jsc: { transform: { optimizer: { globals: { vars: { ORIGINAL: '42' } } } } },
                  },
                },
              ],
            },
          });
    const result = await build({
      input: 'entry.ts',
      plugins: [
        {
          name: 'fixture',
          resolveId: (id) => id,
          load: () => (compiler === 'babel' ? 'export default 1' : 'export default ORIGINAL'),
        },
        plugins,
      ],
      output: { format: 'esm' },
      write: false,
    });
    expect(result.output[0]?.code).toContain('42');
    expect(result.output[0]?.code).not.toContain('ORIGINAL');
  });
});
