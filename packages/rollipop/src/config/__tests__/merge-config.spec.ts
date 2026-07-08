import { describe, it, expect } from 'vite-plus/test';

import { mergeConfig, PluginFlattenConfig } from '../merge-config';

describe('mergeConfig', () => {
  it('should merge configs', () => {
    const reporterA = { update: () => {} };
    const baseConfig: PluginFlattenConfig = {
      root: '/foo',
      resolve: {
        sourceExtensions: ['ts', 'tsx'],
        assetExtensions: ['png', 'jpg'],
        preferNativePlatform: true,
      },
      transform: {
        define: {
          __DEV__: 'true',
        },
      },
      prelude: ['/path/to/prelude-a.js'],
      polyfills: [{ type: 'iife', code: 'console.log("polyfill-a")' }],
      output: {},
      reactNative: {
        assetRegistryPath: '/path/to/AssetRegistry.js',
      },
      reporter: reporterA,
    };

    const configA: PluginFlattenConfig = {
      root: '/bar',
      resolve: {
        sourceExtensions: ['js', 'jsx'],
      },
    };

    const reporterB = { update: () => {} };
    const configB: PluginFlattenConfig = {
      root: '/baz',
      resolve: {
        // Duplicate source extensions should be removed
        sourceExtensions: ['ts', 'jsx'],
      },
      transform: {
        define: {
          __DEV__: 'false',
          'process.env.NODE_ENV': 'production',
        },
      },
      prelude: ['/path/to/prelude-b.js'],
      polyfills: [{ type: 'plain', code: 'console.log("polyfill-b")' }],
      output: {},
      reporter: reporterB,
    };

    const config = mergeConfig(baseConfig, configA, configB);

    expect(config).toEqual({
      root: '/baz',
      resolve: {
        sourceExtensions: ['ts', 'tsx', 'js', 'jsx'],
        assetExtensions: ['png', 'jpg'],
        preferNativePlatform: true,
      },
      transform: {
        define: {
          __DEV__: 'false',
          'process.env.NODE_ENV': 'production',
        },
      },
      prelude: ['/path/to/prelude-a.js', '/path/to/prelude-b.js'],
      polyfills: [
        { type: 'iife', code: 'console.log("polyfill-a")' },
        { type: 'plain', code: 'console.log("polyfill-b")' },
      ],
      output: {},
      reactNative: {
        assetRegistryPath: '/path/to/AssetRegistry.js',
      },
      reporter: reporterB,
    });
  });
});
