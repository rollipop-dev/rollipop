import { describe, it, expect } from 'vite-plus/test';

import type { ResolvedConfig } from '../../config';
import { createTestConfig } from '../../testing/config';
import type { ResolvedBuildOptions } from '../build-options';
import { createId } from '../id';

describe('createId', () => {
  const BUILD_OPTIONS: ResolvedBuildOptions = {
    platform: 'ios',
    dev: true,
    minify: false,
    cache: false,
  };

  it('should return the same id', () => {
    const configA = createTestConfig('/root');
    const configB = createTestConfig('/root');

    configA.plugins = [{ name: 'plugin-a' }, { name: 'plugin-b' }];
    configB.plugins = [{ name: 'plugin-a' }, { name: 'plugin-b' }];

    const idA = createId(configA, BUILD_OPTIONS);
    const idB = createId(configB, BUILD_OPTIONS);

    expect(idA === idB).toBe(true);
  });

  it('should return different id', () => {
    const configA = createTestConfig('/root');
    const configB = createTestConfig('/root');
    const configC = createTestConfig('/root');

    configA.plugins = [{ name: 'plugin-a' }, { name: 'plugin-b' }];
    configB.plugins = [{ name: 'plugin-b' }, { name: 'plugin-a' }]; // different order
    configB.transform.define = { __DEV__: 'false' }; // different value

    const idA = createId(configA, BUILD_OPTIONS);
    const idB = createId(configB, BUILD_OPTIONS);
    const idC = createId(configC, BUILD_OPTIONS);

    expect(idA === idB).toBe(false);
    expect(idA === idC).toBe(false);
    expect([idA, idB, idC]).toMatchInlineSnapshot(`
      [
        "38e86801dcaacf861ddb35629af365c8",
        "867bc9bea7510b68f8c89b8b6e7bdaa5",
        "c38d61264367831911694c8a7bf571de",
      ]
    `);
  });

  it.each([
    ['mode', (config) => (config.mode = 'production')],
    ['output.keepNames', (config) => (config.output.keepNames = true)],
    ['treeshake', (config) => (config.treeshake = false)],
    ['moduleTypes', (config) => (config.moduleTypes = { '.foo': 'text' })],
    ['tsconfig', (config) => (config.tsconfig = false)],
    ['envDir', (config) => (config.envDir = '/env')],
    ['envFile', (config) => (config.envFile = '.env.rollipop')],
    ['envPrefix', (config) => (config.envPrefix = 'APP_')],
    ['runtimeTarget', (config) => (config.runtimeTarget = 'hermes')],
    ['transform.flow', (config) => (config.transform.flow = { requireDirective: true })],
    [
      'experimental.worklets',
      (config) => {
        config.experimental.worklets = { strictGlobal: true };
      },
    ],
    [
      'rolldownOptions',
      (config) => (config.rolldownOptions = { input: { transform: { jsx: 'preserve' } } }),
    ],
  ] satisfies [string, (config: ResolvedConfig) => void][])('%s should affect id', (_, mutate) => {
    const config = createTestConfig('/root');
    const originalId = createId(config, BUILD_OPTIONS);

    mutate(config);

    expect(createId(config, BUILD_OPTIONS)).not.toBe(originalId);
  });
});
