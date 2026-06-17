import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { describe, expect, it, vi } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { resolveBuildOptions } from '../../utils/build-options';
import { resolveRolldownOptions } from '../rolldown';
import type { BundlerContext } from '../types';

function findReporterPlugin(options: Awaited<ReturnType<typeof resolveRolldownOptions>>) {
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

  const plugin = plugins.find((plugin) => plugin.name === 'rollipop:status');
  expect(plugin).toBeDefined();
  return plugin!;
}

describe('resolveRolldownOptions', () => {
  it('transforms only polyfills that opt into Rollipop transform', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    config.devMode.hmr = false;
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    config.serializer.polyfills = [
      {
        type: 'plain',
        // TypeScript
        code: 'var __PLAIN_TRANSFORMED__: number = 1;',
        withTransform: true,
      },
      {
        type: 'iife',
        // Flow
        code: 'global.__IIFE_TRANSFORMED__ = (2: number);',
        withTransform: true,
      },
      {
        type: 'plain',
        code: 'var __PLAIN_UNTRANSFORMED__: number = 3;',
      },
    ];
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

    expect(introCode).toContain('var __PLAIN_TRANSFORMED__ = 1;');
    expect(introCode).not.toContain('var __PLAIN_TRANSFORMED__: number = 1;');
    expect(introCode).toMatch(/\(function\s*\(global\d*\)/);
    expect(introCode).toMatch(/global\d*\.__IIFE_TRANSFORMED__ = 2;/);
    expect(introCode).not.toContain('global.__IIFE_TRANSFORMED__ = (2: number);');
    expect(introCode).toContain('var __PLAIN_UNTRANSFORMED__: number = 3;');
    expect(introCode).toMatchSnapshot();
  });

  it('reports rolldown plugin logs through the reporter pipeline', async () => {
    resolveRolldownOptions.cache.clear();

    const reporter = { update: vi.fn() };
    const root = process.cwd();
    const config = createTestConfig(root);
    config.reporter = reporter;
    config.devMode.hmr = false;
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
        message: 'plugin info',
      } as rolldown.RolldownLog,
      defaultHandler,
    );
    options.input?.onLog?.(
      'warn',
      {
        code: 'PLUGIN_WARNING',
        plugin: 'test-plugin',
        message: 'plugin warning',
      } as rolldown.RolldownLog,
      defaultHandler,
    );

    expect(reporter.update).toHaveBeenCalledWith({
      type: 'build_log',
      level: 'info',
      log: expect.objectContaining({
        code: 'PLUGIN_LOG',
        plugin: 'test-plugin',
        message: 'plugin info',
      }),
    });
    expect(reporter.update).toHaveBeenCalledWith({
      type: 'build_error',
      level: 'warn',
      log: expect.objectContaining({
        code: 'PLUGIN_WARNING',
        plugin: 'test-plugin',
        message: 'plugin warning',
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
      config.devMode.hmr = false;
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
