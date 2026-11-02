import path from 'node:path';

import type { Config as ReactNativeCliConfig } from '@react-native-community/cli-types';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('../../../../common/logo', () => ({ Logo: { printOnce: vi.fn() } }));
vi.mock('../../start/setup-interactive-mode', () => ({}));

import { createCommand, createReactNativeCliCommand } from '../../../cli-utils';
import { command } from '../command';

const bundleArgs = [
  '--entry-file',
  'index.js',
  '--platform',
  'ios',
  '--dev',
  'false',
  '--minify',
  'false',
  '--reset-cache',
  '--bundle-output',
  '/tmp/main.jsbundle',
  '--assets-dest',
  '/tmp/App.app',
  '--config',
  './rollipop.release.config.ts',
];

function createBundleCommand() {
  const action = vi.fn();
  const cli = createCommand({ ...command, action })
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  return { cli, action };
}

describe('bundle command compatibility', () => {
  it.each([
    ['--config-cmd', "'/path with spaces/node' '/app/react-native/cli.js' config", 'configCmd'],
    ['--load-config', '{"root":"/app","platforms":{"ios":{}}}', 'loadConfig'],
  ])(
    'accepts the Xcode %s option without changing existing bundle arguments',
    async (flag, value, key) => {
      const { cli, action } = createBundleCommand();

      await cli.parseAsync([...bundleArgs, flag, value], { from: 'user' });

      expect(action).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          [key]: value,
          entryFile: 'index.js',
          platform: 'ios',
          dev: false,
          minify: false,
          resetCache: true,
          bundleOutput: '/tmp/main.jsbundle',
          assetsDest: '/tmp/App.app',
          config: path.resolve('./rollipop.release.config.ts'),
        }),
      );
      expect(action.mock.contexts).toEqual([{ platforms: ['android', 'ios'] }]);
    },
  );

  it('keeps accepting older React Native bundle arguments without the Xcode config options', async () => {
    const { cli, action } = createBundleCommand();

    await cli.parseAsync(bundleArgs, { from: 'user' });

    expect(action).toHaveBeenCalledOnce();
    expect(cli.opts()).not.toHaveProperty('configCmd');
    expect(cli.opts()).not.toHaveProperty('loadConfig');
  });

  it('accepts both Xcode config options together', async () => {
    const { cli, action } = createBundleCommand();

    await cli.parseAsync([...bundleArgs, '--config-cmd', 'unused command', '--load-config', '{}'], {
      from: 'user',
    });

    expect(action).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ configCmd: 'unused command', loadConfig: '{}' }),
    );
  });

  it.each(['--config-cmd', '--load-config'])('requires a value for %s', async (flag) => {
    const { cli, action } = createBundleCommand();

    await expect(cli.parseAsync([...bundleArgs, flag], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.optionMissingArgument',
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('continues rejecting unknown options', async () => {
    const { cli, action } = createBundleCommand();

    await expect(
      cli.parseAsync([...bundleArgs, '--unknown-config'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.unknownOption' });
    expect(action).not.toHaveBeenCalled();
  });

  it('exposes the same compatibility options through the React Native CLI adapter', async () => {
    const action = vi.fn();
    const nativeCommand = createReactNativeCliCommand({ ...command, action });
    const options = {
      platform: 'ios',
      bundleOutput: '/tmp/main.jsbundle',
      configCmd: 'unused command',
      loadConfig: '{}',
    };

    expect(nativeCommand.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '--config-cmd <string>' }),
        expect.objectContaining({ name: '--load-config <string>' }),
      ]),
    );
    await nativeCommand.func(
      [],
      { platforms: { ios: {}, android: {} } } as unknown as ReactNativeCliConfig,
      options,
    );

    expect(action).toHaveBeenCalledExactlyOnceWith(options);
    expect(action.mock.contexts).toEqual([{ platforms: ['ios', 'android'] }]);
  });
});
