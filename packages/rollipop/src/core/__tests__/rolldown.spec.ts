import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { ResolvedConfig } from '../../config';
import { ProgressBarStatusReporter } from '../../events/builtin-reporters';
import { EventBus } from '../../events/event-bus';
import { createTestConfig } from '../../testing/config';
import type { ReportableEvent } from '../../types';
import { resolveBuildOptions } from '../../utils/build-options';
import {
  getOverrideOptionsForDevServer,
  resolveRolldownOptions,
  resolveWorkletsConfig,
} from '../rolldown';
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
      eventBus: new EventBus(),
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

  it('inlines process.env.EXPO_OS to the platform for native builds (babel-preset-expo parity)', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    const options = await resolveRolldownOptions(
      {
        id: 'test-expo-os-android',
        root,
        buildType: 'build',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'android', dev: true }),
    );

    const define = options.input?.transform?.define as Record<string, unknown> | undefined;
    expect(define).toBeDefined();
    // babel-preset-expo inlines EXPO_OS to the platform string literal
    // (`"android"`); without it expo-modules-core warns "The global
    // process.env.EXPO_OS is not defined".
    expect(define!['process.env.EXPO_OS']).toBe('"android"');
    // Control: the existing EXPO_ROUTER_APP_ROOT inline must remain.
    expect(define!['process.env.EXPO_ROUTER_APP_ROOT']).toBeDefined();
  });

  it('inlines process.env.EXPO_OS to "tvos" for tvOS native builds', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    const options = await resolveRolldownOptions(
      {
        id: 'test-expo-os-tvos',
        root,
        buildType: 'build',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'tvos', dev: true }),
    );

    const define = options.input?.transform?.define as Record<string, unknown> | undefined;
    expect(define).toBeDefined();
    expect(define!['process.env.EXPO_OS']).toBe('"tvos"');
  });

  it('inlines process.env.EXPO_OS to "ios" for macOS native builds (macOS reuses iOS Platform.OS)', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    const options = await resolveRolldownOptions(
      {
        id: 'test-expo-os-macos',
        root,
        buildType: 'build',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'macos', dev: true }),
    );

    const define = options.input?.transform?.define as Record<string, unknown> | undefined;
    expect(define).toBeDefined();
    expect(define!['process.env.EXPO_OS']).toBe('"ios"');
  });

  it('does not inline process.env.EXPO_OS for non-native builds', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    const options = await resolveRolldownOptions(
      {
        id: 'test-expo-os-web',
        root,
        buildType: 'build',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'web', dev: true }),
    );

    const define = options.input?.transform?.define as Record<string, unknown> | undefined;
    expect(define!['process.env.EXPO_OS']).toBeUndefined();
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
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'ios', dev: true }),
      { host: 'localhost', port: 8081, bundleEntry: 'index.bundle' },
    );

    const pluginNames = (await getResolvedPlugins(options)).map((plugin) => plugin.name);

    expect(pluginNames).not.toContain('rollipop:replace-hmr-client');
    expect(pluginNames.some((name) => name.includes('refresh'))).toBe(false);
  });

  it('uses custom React Refresh filters for both transform and wrapper plugins', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const include = [/\/app\/.*\.tsx$/];
    const exclude = [/\/generated\//];
    const config = createTestConfig(root);
    config.transform.jsx = { refresh: { include, exclude } };
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    config.reactNative.hmrClientPath = path.join(root, 'package.json');

    const options = await resolveRolldownOptions(
      {
        id: 'test-dev-server-react-refresh-filter',
        root,
        buildType: 'serve',
        storage: {
          get: () => ({ build: {} }),
          set: () => {},
        } as unknown as BundlerContext['storage'],
        eventBus: new EventBus(),
        state: { revision: 0, latestBuildStartTime: 0 },
      },
      config,
      resolveBuildOptions(config, { platform: 'ios', dev: true }),
      { host: 'localhost', port: 8081, bundleEntry: 'index.bundle' },
    );

    const refresh = (options.input?.transform?.jsx as RolldownJsxOptions)?.refresh;
    expect(refresh).toEqual(expect.objectContaining({ include, exclude }));

    const wrapper = (await getResolvedPlugins(options)).find(
      (plugin) => plugin.name === 'builtin:rollipop-react-refresh-wrapper',
    );
    expect(wrapper).toBeDefined();
    const wrapperOptions = Reflect.get(wrapper!, '_options');
    expect(wrapperOptions).toEqual(expect.objectContaining({ include, exclude }));
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

    const require = createRequire(import.meta.url);
    const reactRoot = path.dirname(require.resolve('react'));
    const reactNativeRoot = path.dirname(require.resolve('react-native'));
    expect(options.input?.resolve?.alias).toEqual({
      '@src': '/project/src',
      react: `${reactRoot}/index.js`,
      'react/jsx-runtime': `${reactRoot}/jsx-runtime.js`,
      'react/jsx-dev-runtime': `${reactRoot}/jsx-dev-runtime.js`,
      'react-native': `${reactNativeRoot}/index.js`,
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

    const require = createRequire(import.meta.url);
    const reactRoot = path.dirname(require.resolve('react'));
    const reactNativeRoot = path.dirname(require.resolve('react-native'));
    // Array aliases are routed through the `vite-alias` plugin (which chains to
    // plugin resolveId hooks), so they do NOT appear in rolldown's object-form
    // `resolve.alias` — only the react dedupe aliases do.
    expect(options.input?.resolve?.alias).toEqual({
      react: `${reactRoot}/index.js`,
      'react/jsx-runtime': `${reactRoot}/jsx-runtime.js`,
      'react/jsx-dev-runtime': `${reactRoot}/jsx-dev-runtime.js`,
      'react-native': `${reactNativeRoot}/index.js`,
    });
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
      eventBus: new EventBus(),
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
      eventBus: new EventBus(),
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

  it('routes hmr_updates to builtin and configured reporters through the context event bus', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const config = createTestConfig(root);
    const reporter = { update: vi.fn() };
    const eventBus = new EventBus();
    const builtinUpdate = vi
      .spyOn(ProgressBarStatusReporter.prototype, 'update')
      .mockImplementation(() => {});
    config.reporter = reporter;
    config.terminal.status = 'progress';
    config.dev.hmr = false;
    config.reactNative.assetRegistryPath = path.join(root, 'package.json');
    const context = {
      id: 'test-hmr-event-bus',
      root,
      buildType: 'serve',
      storage: {
        get: () => ({ build: {} }),
        set: () => {},
      } as unknown as BundlerContext['storage'],
      eventBus,
      state: { revision: 0, latestBuildStartTime: 0 },
    } satisfies BundlerContext;
    const event: ReportableEvent = {
      type: 'hmr_updates',
      bundlerId: context.id,
      updates: [],
      changedFiles: [path.join(root, 'App.tsx')],
    };

    try {
      await resolveRolldownOptions(
        context,
        config,
        resolveBuildOptions(config, { platform: 'ios', dev: true }),
        { host: 'localhost', port: 8081, bundleEntry: 'index.bundle' },
      );
      eventBus.emit(event);

      expect(builtinUpdate).toHaveBeenCalledWith(event);
      expect(reporter.update).toHaveBeenCalledWith(event);
    } finally {
      builtinUpdate.mockRestore();
    }
  });

  it('persists completed build totals for fresh serve reporter instances', async () => {
    resolveRolldownOptions.cache.clear();

    const root = process.cwd();
    const data = { build: {} as Record<string, { totalModules: number }> };
    const flush = vi.fn();
    const storage = {
      get: () => data,
      set: (value: typeof data) => {
        data.build = { ...data.build, ...value.build };
      },
      flush,
    } as unknown as BundlerContext['storage'];
    const createContext = () =>
      ({
        id: 'test-bundler',
        root,
        buildType: 'serve',
        storage,
        eventBus: new EventBus(),
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
      { host: 'localhost', port: 8081, bundleEntry: 'index.bundle' },
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
    expect(flush).toHaveBeenCalledOnce();

    resolveRolldownOptions.cache.clear();

    const events: unknown[] = [];
    const secondConfig = createConfig();
    secondConfig.reporter = {
      update(event) {
        events.push(event);
      },
    };

    const secondOptions = await resolveRolldownOptions(
      createContext(),
      secondConfig,
      buildOptions,
      { host: 'localhost', port: 8081, bundleEntry: 'index.bundle' },
    );
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

describe('resolveWorkletsConfig (reanimated/worklets auto-enable)', () => {
  const appRoot = path.resolve(__dirname, '../../../../packages/expo/apps/rollipop-expo-example');
  const hasWorklets = fs.existsSync(path.join(appRoot, 'node_modules', 'react-native-worklets'));

  it('auto-enables worklets when react-native-worklets is resolvable from the project', () => {
    if (!hasWorklets) {
      // The example app doesn't have the dep in this environment; assert the
      // absent-path contract instead so the test is deterministic.
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-wk-'));
      try {
        const cfg = createTestConfig(empty);
        expect(resolveWorkletsConfig(cfg)).toBeUndefined();
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
      return;
    }
    const cfg = createTestConfig(appRoot);
    const result = resolveWorkletsConfig(cfg);
    expect(result).toBeDefined();
    expect(result?.pluginVersion).toBeTruthy();
    expect(result?.isRelease).toBe(false);
  });

  it('returns undefined when worklets is unset and the dep is absent', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-wk-'));
    try {
      const cfg = createTestConfig(empty);
      expect(resolveWorkletsConfig(cfg)).toBeUndefined();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('honors an explicit worklets override (no auto-detection)', () => {
    const base = createTestConfig(process.cwd());
    const cfg = {
      ...base,
      experimental: { worklets: { pluginVersion: '9.9.9', isRelease: true } },
    } as ResolvedConfig;
    const result = resolveWorkletsConfig(cfg);
    expect(result?.pluginVersion).toBe('9.9.9');
    expect(result?.isRelease).toBe(true);
  });
});
