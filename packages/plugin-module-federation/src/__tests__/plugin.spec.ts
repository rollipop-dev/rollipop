import type { PluginConfig, RolldownOptionsContext } from 'rollipop';
import { describe, expect, it } from 'vite-plus/test';

import { moduleFederationPlugin } from '../plugin';

async function resolveRemoteFormat(buildType: RolldownOptionsContext['buildType']) {
  const plugin = moduleFederationPlugin({
    name: 'remote_app',
    exposes: { './Counter': './Counter.tsx' },
  });
  const configHook = plugin.config;
  if (typeof configHook !== 'function') {
    throw new Error('Expected the module federation config hook');
  }

  const config = await configHook.call({} as never, {
    prelude: ['prelude.js'],
    polyfills: [{ type: 'iife', code: 'polyfill();' }],
  } satisfies PluginConfig);
  if (typeof config?.rolldownOptions !== 'function') {
    throw new Error('Expected a rolldownOptions hook');
  }

  const options = await config.rolldownOptions(
    { input: {}, output: { format: 'rollipop' } },
    {
      id: 'remote-id',
      root: '/project',
      buildType,
      platform: 'ios',
      dev: true,
      cache: true,
      minify: false,
    },
  );

  return options.output?.format;
}

describe('moduleFederationPlugin', () => {
  it('keeps Rollipop output for remote dev engines', async () => {
    await expect(resolveRemoteFormat('serve')).resolves.toBe('rollipop');
  });

  it('uses IIFE output for static remote bundles', async () => {
    await expect(resolveRemoteFormat('build')).resolves.toBe('iife');
  });
});
