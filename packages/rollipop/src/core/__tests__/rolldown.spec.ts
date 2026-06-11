import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { describe, expect, it, vi } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { resolveBuildOptions } from '../../utils/build-options';
import { resolveRolldownOptions } from '../rolldown';
import type { BundlerContext } from '../types';

describe('resolveRolldownOptions', () => {
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
});
