import { describe, it, expect, vitest } from 'vite-plus/test';

import type { Plugin } from '../../core/plugins/types';
import type { ResolvedConfig } from '../defaults';
import { invokeConfigResolved, resolvePluginConfig } from '../load-config';
import type { Config } from '../types';

describe('resolvePluginConfig', () => {
  it('should resolve plugin config', async () => {
    const baseConfig: Config = {
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
      prelude: ['/path/to/prelude.js'],
      polyfills: [{ type: 'iife', code: 'console.log("polyfill")' }],
      output: {},
      reactNative: {
        assetRegistryPath: '/path/to/AssetRegistry.js',
      },
    };

    const pluginA: Plugin = {
      name: 'plugin-a',
      config: {
        root: '/plugin-a',
        resolve: {
          sourceExtensions: ['js', 'jsx'],
        },
        transform: {
          define: {
            'process.env.PLUGIN_A': 'true',
          },
        },
        prelude: ['/path/to/prelude-plugin-a.js'],
        polyfills: [{ type: 'plain', code: 'console.log("polyfill-plugin-a")' }],
        output: {},
      },
    };

    const pluginB: Plugin = {
      name: 'plugin-b',
      config: () => ({
        root: '/plugin-b',
        resolve: {
          assetExtensions: ['webp'],
          preferNativePlatform: false,
        },
        transform: {
          define: {
            'process.env.PLUGIN_B': 'true',
          },
        },
        prelude: ['/path/to/prelude-plugin-b.js'],
        polyfills: [{ type: 'iife', code: 'console.log("polyfill-plugin-b")' }],
        output: {},
        reactNative: {
          assetRegistryPath: '/path/to/AssetRegistry-plugin-b.js',
        },
      }),
    };

    const pluginC: Plugin = {
      name: 'plugin-c',
      config: (config) => {
        config.root = '/plugin-c';

        if (config.reactNative) {
          config.reactNative.assetRegistryPath = '/path/to/AssetRegistry-plugin-c.js';
        }
      },
    };

    const pluginConfig = await resolvePluginConfig(baseConfig, [pluginA, pluginB, pluginC]);

    expect(pluginConfig).toEqual({
      root: '/plugin-c',
      resolve: {
        sourceExtensions: ['ts', 'tsx', 'js', 'jsx'],
        assetExtensions: ['png', 'jpg', 'webp'],
        preferNativePlatform: false,
      },
      transform: {
        define: {
          __DEV__: 'true',
          'process.env.PLUGIN_A': 'true',
          'process.env.PLUGIN_B': 'true',
        },
      },
      prelude: [
        '/path/to/prelude.js',
        '/path/to/prelude-plugin-a.js',
        '/path/to/prelude-plugin-b.js',
      ],
      polyfills: [
        { type: 'iife', code: 'console.log("polyfill")' },
        { type: 'plain', code: 'console.log("polyfill-plugin-a")' },
        { type: 'iife', code: 'console.log("polyfill-plugin-b")' },
      ],
      output: {},
      reactNative: {
        assetRegistryPath: '/path/to/AssetRegistry-plugin-c.js',
      },
    });
  });
});

describe('resolvePluginConfig — dangerously_overrideRolldownOptions composition', () => {
  it('chains user config and plugin overrides in declaration order', async () => {
    const calls: string[] = [];
    const userOverride: NonNullable<Config['dangerously_overrideRolldownOptions']> = (opts) => {
      calls.push('user');
      (opts.output as Record<string, unknown>).userMark = true;
      return opts;
    };
    const pluginOverride: NonNullable<Config['dangerously_overrideRolldownOptions']> = (opts) => {
      calls.push('plugin');
      (opts.output as Record<string, unknown>).pluginMark = true;
      return opts;
    };

    const baseConfig: Config = {
      dangerously_overrideRolldownOptions: userOverride,
    };

    const plugin: Plugin = {
      name: 'plugin-a',
      config: () => ({ dangerously_overrideRolldownOptions: pluginOverride }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);

    expect(typeof merged.dangerously_overrideRolldownOptions).toBe('function');
    const composed = merged.dangerously_overrideRolldownOptions as (input: {
      input: object;
      output: object;
    }) => Promise<{ input: object; output: Record<string, unknown> }>;
    const finalOpts = await composed({ input: {}, output: {} });
    expect(calls).toEqual(['user', 'plugin']);
    expect(finalOpts.output).toMatchObject({ userMark: true, pluginMark: true });
  });

  it('uses single override unchanged when only one source defines it', async () => {
    const single: NonNullable<Config['dangerously_overrideRolldownOptions']> = (opts) => opts;
    const baseConfig: Config = {};
    const plugin: Plugin = {
      name: 'plugin-only',
      config: () => ({ dangerously_overrideRolldownOptions: single }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);
    expect(merged.dangerously_overrideRolldownOptions).toBe(single);
  });
});

describe('invokeConfigResolved', () => {
  it('should invoke plugin config resolved', async () => {
    const resolvedConfig = {
      root: '/root',
    } as ResolvedConfig;

    const invoked = vitest.fn();
    const pluginA: Plugin = {
      name: 'plugin-a',
      configResolved: (config) => {
        invoked(config);
      },
    };

    const pluginB: Plugin = {
      name: 'plugin-b',
      configResolved: async (config) => {
        invoked(config);
      },
    };

    await invokeConfigResolved(resolvedConfig, [pluginA, pluginB]);

    expect(invoked).toHaveBeenCalledTimes(2);
    expect(invoked).toHaveBeenNthCalledWith(1, resolvedConfig);
    expect(invoked).toHaveBeenNthCalledWith(2, resolvedConfig);
  });
});
