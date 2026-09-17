import path from 'node:path';

import { interpreter } from '@rollipop/rolldown/filter';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundlerContext } from '../../types';
import { reactNative, type ReactNativePluginOptions } from '../react-native-plugin';

type ResolveIdHook = {
  order?: string;
  filter: Parameters<typeof interpreter>[0];
  handler: (
    this: { resolve: ReturnType<typeof vi.fn> },
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ) => unknown;
};

describe('react-native plugin', () => {
  it('falls back to the physical path for React Native private modules', async () => {
    const reactNativePath = path.join('/project', 'node_modules', 'react-native');
    const plugin = reactNative(createOptions(reactNativePath))[0]!;
    const resolveId = plugin.resolveId as unknown as ResolveIdHook;
    const importer = path.join('/project', 'node_modules', '@react-native', 'package', 'index.js');
    const source = 'react-native/src/private/featureflags/ReactNativeFeatureFlags';
    const resolved = {
      id: `${path.join(reactNativePath, source.slice('react-native/'.length))}.js`,
    };
    const resolve = vi.fn().mockResolvedValue(resolved);

    expect(resolveId.order).toBe('post');
    expect(interpreter(resolveId.filter, undefined, source, undefined, importer)).toBe(true);
    await expect(
      resolveId.handler.call({ resolve }, source, importer, { kind: 'import-statement' }),
    ).resolves.toEqual(resolved);
    expect(resolve).toHaveBeenCalledWith(
      path.join(reactNativePath, 'src/private/featureflags/ReactNativeFeatureFlags'),
      importer,
      { kind: 'import-statement', skipSelf: true },
    );
  });

  it('does not intercept public or escaping React Native paths', async () => {
    const reactNativePath = path.join('/project', 'node_modules', 'react-native');
    const plugin = reactNative(createOptions(reactNativePath))[0]!;
    const resolveId = plugin.resolveId as unknown as ResolveIdHook;
    const resolve = vi.fn();

    for (const source of [
      'react-native',
      'react-native/Libraries/Utilities/Platform',
      'react-native/src/fb_internal/Utilities',
      '@react-native/virtualized-lists',
    ]) {
      expect(interpreter(resolveId.filter, undefined, source)).toBe(false);
    }

    expect(
      resolveId.handler.call(
        { resolve },
        'react-native/src/private/../../../../outside',
        undefined,
        {},
      ),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});

function createOptions(reactNativePath: string): ReactNativePluginOptions {
  return {
    context: {} as BundlerContext,
    projectRoot: '/project',
    reactNativePath,
    platform: 'ios',
    preferNativePlatform: true,
    buildType: 'serve',
    assetExtensions: ['png'],
    assetRegistryPath: 'react-native/asset-registry',
    builtinPluginConfig: {
      envName: 'development',
      runtimeTarget: 'hermes-v1',
    },
  };
}
