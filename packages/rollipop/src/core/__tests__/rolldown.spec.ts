import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { describe, expect, it, vi } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { resolveBuildOptions } from '../../utils/build-options';
import { getOverrideOptionsForDevServer, resolveRolldownOptions } from '../rolldown';
import type { BundlerContext } from '../types';

type RolldownTransformOptions = NonNullable<rolldown.InputOptions['transform']>;
type RolldownJsxOptions = RolldownTransformOptions['jsx'] extends infer T
  ? T extends object
    ? T
    : never
  : never;

function getPlugins(options: Awaited<ReturnType<typeof resolveRolldownOptions>>) {
  const plugins: rolldown.Plugin[] = [];
  const visit = (plugin: unknown) => {
    if (plugin == null) {
      return;
    }
    if (Array.isArray(plugin)) {
      plugin.forEach(visit);
      return;
    }
    plugins.push(plugin as rolldown.Plugin);
  };

  visit(options.input?.plugins);

  return plugins;
}

async function getResolvedPlugins(options: Awaited<ReturnType<typeof resolveRolldownOptions>>) {
  const plugins: rolldown.Plugin[] = [];
  const visit = async (pluginOption: unknown) => {
    const plugin = await pluginOption;
    if (plugin == null || plugin === false) {
      return;
    }
    if (Array.isArray(plugin)) {
      await Promise.all(plugin.map(visit));
      return;
    }
    plugins.push(plugin as rolldown.Plugin);
  };

  await visit(options.input?.plugins);

  return plugins;
}

function findReporterPlugin(options: Awaited<ReturnType<typeof resolveRolldownOptions>>) {
  const plugins = getPlugins(options);
  const plugin = plugins.find((plugin) => plugin.name === 'rollipop:status');
  expect(plugin).toBeDefined();
  return plugin!;
}

async function resolveTestRolldownOptions(
  config: ReturnType<typeof createTestConfig>,
  contextId: string,
) {
  config.dev.hmr = false;
  config.reactNative.assetRegistryPath = path.join(config.root, 'package.json');

  return resolveRolldownOptions(
    {
      id: contextId,
      root: config.root,
      buildType: 'build',
      storage: {
        get: () => ({ build: {} }),
        set: () => {},
      } as unknown as BundlerContext['storage'],
      state: { revision: 0, latestBuildStartTime: 0 },
    },
    config,
    resolveBuildOptions(config, { platform: 'ios', dev: true }),
  );
}

describe('resolveRolldownOptions', () => {
  it('disables React Refresh transform options for dev server when HMR is disabled', () => {
    const config = createTestConfig(process.cwd());
    config.dev.hmr = false;

    const options = getOverrideOptionsForDevServer(
      resolveBuildOptions(config, { platform: 'ios', dev: true }),
      false,
    );

    expect(options.input.transform?.jsx).toEqual({ development: true });
  });

  it('excludes React Refresh wrapper plugins for dev server when HMR is disabled', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    const options = await resolveRolldownOptions(
      {
        id: 'test-dev-server-hmr-disabled',
        root,
        buildType: 'serve',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'ios', dev: true }),
      { host: 'localhost', port: 8081 },
    );

    const pluginNames = (await getResolvedPlugins(options)).map((plugin) => plugin.name);

    expect(pluginNames).not.toContain('rollipop:replace-hmr-client');
    expect(pluginNames.some((name) => name.includes('refresh'))).toBe(false);
  });

  it('keeps react compiler disabled by default', async () => {
    resolveRolldownOptions.cache.clear();

    const options = await resolveTestRolldownOptions(
      createTestConfig(process.cwd()),
      'test-bundler-react-compiler-disabled',
    );

    expect((options.input?.transform?.jsx as RolldownJsxOptions)?.compiler).toBeUndefined();
  });

  it('enables react compiler with default exclude when configured with an empty object', async () => {
    resolveRolldownOptions.cache.clear();

    const config = createTestConfig(process.cwd());
    config.transform.jsx = { compiler: {} };

    const options = await resolveTestRolldownOptions(
      config,
      'test-bundler-react-compiler-empty-object',
    );

    expect((options.input?.transform?.jsx as RolldownJsxOptions)?.compiler).toEqual({
      exclude: [/node_modules/],
    });
  });

  it('uses user react compiler exclude patterns instead of the default node_modules rule', async () => {
    resolveRolldownOptions.cache.clear();

    const config = createTestConfig(process.cwd());
    config.transform.jsx = { compiler: { exclude: [/vendor/], target: '18' } };

    const options = await resolveTestRolldownOptions(
      config,
      'test-bundler-react-compiler-custom-exclude',
    );

    expect((options.input?.transform?.jsx as RolldownJsxOptions)?.compiler).toEqual({
      exclude: [/vendor/],
      target: '18',
    });
  });

  it('applies rolldownOptions after Rollipop internal build overrides', async () => {
    resolveRolldownOptions.cache.clear();

    const config = createTestConfig(process.cwd());
    const calls: string[] = [];
    config.rolldownOptions = (options, context) => {
      calls.push(context.buildType, context.platform);
      expect(options.output?.format).toBe('rollipop');
      return {
        ...options,
        output: {
          ...options.output,
          format: 'iife',
        },
      };
    };

    const options = await resolveTestRolldownOptions(config, 'test-bundler-final-rolldown-options');

    expect(calls).toEqual(['build', 'ios']);
    expect(options.output?.format).toBe('iife');
    expect(options.input?.optimization?.inlineConst).toBe(false);
  });

  it('passes object aliases to rolldown resolve options', async () => {
    resolveRolldownOptions.cache.clear();

    const config = createTestConfig(process.cwd());
    config.resolve.alias = {
      '@src': '/project/src',
    };

    const options = await resolveTestRolldownOptions(config, 'test-bundler-object-alias');

    expect(options.input?.resolve?.alias).toEqual({
      '@src': '/project/src',
    });
    expect(getPlugins(options).map((plugin) => plugin.name)).not.toContain('builtin:vite-alias');
  });

  it('installs array aliases through the alias plugin', async () => {
    resolveRolldownOptions.cache.clear();

    const config = createTestConfig(process.cwd());
    config.resolve.alias = [
      {
        find: '@src',
        replacement: '/project/src',
      },
    ];

    const options = await resolveTestRolldownOptions(config, 'test-bundler-array-alias');

    expect(options.input?.resolve?.alias).toBeUndefined();
    expect(getPlugins(options).map((plugin) => plugin.name)).toContain('builtin:vite-alias');
  });

  it('injects polyfills through the output intro', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    config.polyfills = [{ type: 'plain', code: 'var __POLYFILL__ = 1;' }];
    const context = {
      id: 'test-bundler',
      root,
      buildType: 'build',
      storage: {
        get: () => ({ build: {} }),
        set: () => {},
      } as unknown as BundlerContext['storage'],
      state: { revision: 0, latestBuildStartTime: 0 },
    } satisfies BundlerContext;
    const options = await resolveRolldownOptions(
      context,
      config,
      resolveBuildOptions(config, { platform: 'ios', dev: false }),
    );

    expect(typeof options.output?.intro).toBe('function');
    const intro = options.output!.intro as (
      chunk: rolldown.OutputChunk,
    ) => string | Promise<string>;
    const introCode = await intro({ fileName: 'bundle.js' } as rolldown.OutputChunk);

    expect(introCode).toContain('__POLYFILL__');
    expect(introCode).toContain('\\0rollipop/polyfill?index=0');
  });

  it('reports rolldown build logs through the reporter pipeline', async () => {
    resolveRolldownOptions.cache.clear();

    const reporter = { update: vi.fn() };
    const root = process.cwd();
    const config = createTestConfig(root);
    config.reporter = reporter;
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    const context = {
      id: 'test-bundler',
      root,
      buildType: 'build',
      storage: {
        get: () => ({ build: {} }),
        set: () => {},
      } as unknown as BundlerContext['storage'],
      state: { revision: 0, latestBuildStartTime: 0 },
    } satisfies BundlerContext;
    const options = await resolveRolldownOptions(
      context,
      config,
      resolveBuildOptions(config, { platform: 'ios', dev: true }),
    );
    const defaultHandler = vi.fn();

    options.input?.onLog?.(
      'info',
      {
        code: 'PLUGIN_LOG',
        plugin: 'test-plugin',
        message: 'build info',
      } as rolldown.RolldownLog,
      defaultHandler,
    );
    options.input?.onLog?.(
      'warn',
      {
        code: 'PLUGIN_WARNING',
        plugin: 'test-plugin',
        message: 'build warning',
      } as rolldown.RolldownLog,
      defaultHandler,
    );

    expect(reporter.update).toHaveBeenCalledWith({
      type: 'build_log',
      level: 'info',
      log: expect.objectContaining({
        code: 'PLUGIN_LOG',
        plugin: 'test-plugin',
        message: 'build info',
      }),
    });
    expect(reporter.update).toHaveBeenCalledWith({
      type: 'build_error',
      level: 'warn',
      log: expect.objectContaining({
        code: 'PLUGIN_WARNING',
        plugin: 'test-plugin',
        message: 'build warning',
      }),
    });
    expect(defaultHandler).not.toHaveBeenCalled();
  });

  it('persists completed build totals for fresh progress reporter instances', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const data = { build: {} as Record<string, { totalModules: number }> };
    const storage = {
      get: () => data,
      set: (value: typeof data) => {
        data.build = { ...data.build, ...value.build };
      },
    } as unknown as BundlerContext['storage'];
    const createContext = () =>
      ({
        id: 'test-bundler',
        root,
        buildType: 'build',
        storage,
        state: { revision: 0, latestBuildStartTime: 0 },
      }) satisfies BundlerContext;
    const createConfig = () => {
      const config = createTestConfig(root);
      config.dev.hmr = false;
      config.reactNative.assetRegistryPath = path.join(root, 'package.json');
      return config;
    };
    const buildOptions = resolveBuildOptions(createConfig(), { platform: 'ios', dev: true });

    const firstOptions = await resolveRolldownOptions(
      createContext(),
      createConfig(),
      buildOptions,
    );
    const firstPlugin = findReporterPlugin(firstOptions);
    const firstBuildStart = firstPlugin.buildStart as unknown as () => void;
    const firstBuildEnd = firstPlugin.buildEnd as unknown as () => void;
    const firstTransform = firstPlugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };

    firstBuildStart();
    await firstTransform.handler('', '/entry.ts');
    await firstTransform.handler('', '/dep.ts');
    firstBuildEnd();

    expect(data.build['test-bundler']).toEqual({ totalModules: 2 });

    resolveRolldownOptions.cache.clear();

    const events: unknown[] = [];
    const secondConfig = createConfig();
    secondConfig.reporter = {
      update(event) {
        events.push(event);
      },
    };

    const secondOptions = await resolveRolldownOptions(createContext(), secondConfig, buildOptions);
    const secondPlugin = findReporterPlugin(secondOptions);
    const secondBuildStart = secondPlugin.buildStart as unknown as () => void;
    const secondTransform = secondPlugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };

    secondBuildStart();
    await secondTransform.handler('', '/entry.ts');

    expect(events).toContainEqual({
      type: 'transform',
      id: '/entry.ts',
      totalModules: 2,
      transformedModules: 1,
    });
  });
});
