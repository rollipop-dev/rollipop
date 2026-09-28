import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, it, expect, vitest } from 'vite-plus/test';

import type { Plugin } from '../../core/plugins/types';
import type {
  RolldownOptions,
  RolldownOptionsContext,
  RolldownOptionsFunction,
} from '../../core/rolldown';
import { createTestConfig } from '../../testing/config';
import * as defaults from '../defaults';
import type { ResolvedConfig } from '../defaults';
import { invokeConfigResolved, loadConfig, resolvePluginConfig } from '../load-config';
import type { Config } from '../types';

describe('loadConfig', () => {
  let projectRoot: string;
  let configPath: string;

  beforeEach(() => {
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-config-')));
    configPath = path.join(projectRoot, 'rollipop.config.mjs');
    vitest.spyOn(defaults, 'getDefaultConfig').mockResolvedValue(createTestConfig(projectRoot));
    fs.writeFileSync(
      configPath,
      'export default ({ command, defaultConfig }) => ({ entry: command + "-" + defaultConfig.entry });',
    );
  });

  afterEach(() => {
    vitest.restoreAllMocks();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it.each(['automatic', 'relative', 'absolute'] as const)(
    'passes command and defaults to a config function using %s file selection',
    async (mode) => {
      const configFiles = {
        automatic: undefined,
        relative: './rollipop.config.mjs',
        absolute: configPath,
      };
      const config = await loadConfig({
        cwd: projectRoot,
        configFile: configFiles[mode],
        context: { command: 'start' },
      });

      expect(config.configFile).toBe(configPath);
      expect(config.entry).toBe(path.join(projectRoot, 'start-index.js'));
    },
  );

  it('passes context to an explicitly selected async config function', async () => {
    fs.writeFileSync(
      configPath,
      'export default async ({ command, defaultConfig }) => ({ entry: command + "-" + defaultConfig.entry });',
    );

    const config = await loadConfig({
      cwd: projectRoot,
      configFile: configPath,
      context: { command: 'bundle' },
    });

    expect(config.entry).toBe(path.join(projectRoot, 'bundle-index.js'));
  });

  it('still loads an explicitly selected object config', async () => {
    fs.writeFileSync(configPath, 'export default { entry: "custom.js" };');

    const config = await loadConfig({ cwd: projectRoot, configFile: configPath });

    expect(config.entry).toBe(path.join(projectRoot, 'custom.js'));
  });

  it('still rejects a missing explicitly selected config file', async () => {
    await expect(
      loadConfig({ cwd: projectRoot, configFile: './missing.config.mjs' }),
    ).rejects.toThrow();
  });
});

const rolldownOptionsContext = {
  id: 'test-bundler',
  root: '/root',
  buildType: 'build',
  platform: 'ios',
  dev: false,
  minify: false,
  cache: true,
} as RolldownOptionsContext;

function createRolldownOptions(): RolldownOptions {
  return {
    input: {},
    output: {},
  };
}

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

describe('resolvePluginConfig — rolldownOptions composition', () => {
  it('composes function options in declaration order', async () => {
    const calls: string[] = [];
    const userOverride: RolldownOptionsFunction = (opts, context) => {
      calls.push('user');
      expect(context).toBe(rolldownOptionsContext);
      return {
        ...opts,
        output: {
          ...opts.output,
          userMark: true,
        },
      };
    };
    const pluginOverride: RolldownOptionsFunction = (opts, context) => {
      calls.push('plugin');
      expect(context).toBe(rolldownOptionsContext);
      expect(opts.output).toMatchObject({ userMark: true });
      return {
        ...opts,
        output: {
          ...opts.output,
          pluginMark: true,
        },
      };
    };

    const baseConfig: Config = {
      rolldownOptions: userOverride,
    };

    const plugin: Plugin = {
      name: 'plugin-a',
      config: () => ({ rolldownOptions: pluginOverride }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);

    expect(typeof merged.rolldownOptions).toBe('function');
    const composed = merged.rolldownOptions as RolldownOptionsFunction;
    const finalOpts = await composed(createRolldownOptions(), rolldownOptionsContext);
    expect(calls).toEqual(['user', 'plugin']);
    expect(finalOpts.output).toMatchObject({ userMark: true, pluginMark: true });
  });

  it('uses single override unchanged when only one source defines it', async () => {
    const single: NonNullable<Config['rolldownOptions']> = (opts) => opts;
    const baseConfig: Config = {};
    const plugin: Plugin = {
      name: 'plugin-only',
      config: () => ({ rolldownOptions: single }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);
    expect(merged.rolldownOptions).toBe(single);
  });

  it('merges object options from user config and plugins', async () => {
    const baseConfig: Config = {
      rolldownOptions: {
        input: { external: ['react'] },
      },
    };
    const plugin: Plugin = {
      name: 'plugin-object',
      config: () => ({
        rolldownOptions: {
          output: { banner: '/* plugin */' },
        },
      }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);
    expect(merged.rolldownOptions).toMatchObject({
      input: { external: ['react'] },
      output: { banner: '/* plugin */' },
    });
  });

  it('composes object then function options in declaration order', async () => {
    const calls: string[] = [];
    const pluginOverride: RolldownOptionsFunction = (opts, context) => {
      calls.push('plugin');
      expect(context).toBe(rolldownOptionsContext);
      expect(opts).toMatchObject({
        input: { external: ['react'] },
        output: { banner: '/* user */' },
      });
      return {
        ...opts,
        output: {
          ...opts.output,
          footer: '/* plugin */',
        },
      };
    };

    const baseConfig: Config = {
      rolldownOptions: {
        input: { external: ['react'] },
        output: { banner: '/* user */' },
      },
    };
    const plugin: Plugin = {
      name: 'plugin-function',
      config: () => ({ rolldownOptions: pluginOverride }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);

    expect(typeof merged.rolldownOptions).toBe('function');
    const composed = merged.rolldownOptions as RolldownOptionsFunction;
    const finalOpts = await composed(createRolldownOptions(), rolldownOptionsContext);
    expect(calls).toEqual(['plugin']);
    expect(finalOpts).toMatchObject({
      input: { external: ['react'] },
      output: { banner: '/* user */', footer: '/* plugin */' },
    });
  });

  it('composes function then object options in declaration order', async () => {
    const calls: string[] = [];
    const userOverride: RolldownOptionsFunction = (opts, context) => {
      calls.push('user');
      expect(context).toBe(rolldownOptionsContext);
      return {
        ...opts,
        input: {
          ...opts.input,
          external: ['react'],
        },
      };
    };

    const baseConfig: Config = {
      rolldownOptions: userOverride,
    };
    const plugin: Plugin = {
      name: 'plugin-object',
      config: () => ({
        rolldownOptions: {
          output: { banner: '/* plugin */' },
        },
      }),
    };

    const merged = await resolvePluginConfig(baseConfig, [plugin]);

    expect(typeof merged.rolldownOptions).toBe('function');
    const composed = merged.rolldownOptions as RolldownOptionsFunction;
    const finalOpts = await composed(createRolldownOptions(), rolldownOptionsContext);
    expect(calls).toEqual(['user']);
    expect(finalOpts).toMatchObject({
      input: { external: ['react'] },
      output: { banner: '/* plugin */' },
    });
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
