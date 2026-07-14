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
        "ced3fc6a99712672db3303fbd827e4a1",
        "9d9e3706cdff3a6b033a7e47875d6164",
        "04fe5f1b00e4247c752be0abfa9f9f63",
      ]
    `);
  });

  it.each([
    ['mode', (config) => (config.mode = 'production')],
    ['output.keepNames', (config) => (config.output.keepNames = true)],
    ['treeshake', (config) => (config.treeshake = false)],
    ['moduleTypes', (config) => (config.moduleTypes = { '.foo': 'text' })],
    ['tsconfig', (config) => (config.tsconfig = false)],
    [
      'reactNative.codegen',
      (config) => (config.reactNative.codegen = { filter: { code: /codegenNativeCommands/ } }),
    ],
    ['envDir', (config) => (config.envDir = '/env')],
    ['envFile', (config) => (config.envFile = '.env.rollipop')],
    ['envPrefix', (config) => (config.envPrefix = 'APP_')],
    ['runtimeTarget', (config) => (config.runtimeTarget = 'hermes')],
    [
      'experimental',
      (config) => {
        config.experimental.nativeTransformPipeline = true;
        config.experimental.flow = { requireDirective: true };
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
