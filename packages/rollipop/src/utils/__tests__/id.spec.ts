import { describe, it, expect } from 'vite-plus/test';

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
        "758c7ccdd69a8c6bb0725e6fef25f9ac",
        "6c631621bffdcc5e05ea02659b4df7c5",
        "14a7aa2e4813504a70aca675c3646b4e",
      ]
    `);
  });
});
