import type { RollipopReactNativeWorkletsConfig } from '@rollipop/rolldown/experimental';
import { satisfies } from 'semver';

import type { ResolvedConfig, WorkletsConfig } from '../config';
import { resolvePackageJson } from './node-resolve';

export function resolveWorkletsConfig(
  worklets: WorkletsConfig | undefined,
  { root, mode }: Pick<ResolvedConfig, 'root' | 'mode'>,
): RollipopReactNativeWorkletsConfig | undefined {
  if (worklets == null) {
    return undefined;
  }

  const { pluginVersion, reanimatedVersion, ...options } = worklets;
  const defaults = { ...options, isRelease: options.isRelease ?? mode === 'production' };

  if (pluginVersion != null) {
    return { ...defaults, pluginVersion };
  }
  if (reanimatedVersion != null) {
    return { ...defaults, reanimatedVersion };
  }

  const installedReanimatedVersion = resolvePackageJson(root, 'react-native-reanimated')?.version;
  if (
    installedReanimatedVersion != null &&
    satisfies(installedReanimatedVersion, '3.x', { includePrerelease: true })
  ) {
    return { ...defaults, reanimatedVersion: installedReanimatedVersion };
  }

  const installedWorkletsVersion = resolvePackageJson(root, 'react-native-worklets')?.version;
  if (installedWorkletsVersion != null) {
    return { ...defaults, pluginVersion: installedWorkletsVersion };
  }

  throw new Error(
    'Could not resolve a worklet runtime. Install react-native-reanimated 3.x or react-native-worklets, or set reanimatedVersion or pluginVersion in the worklets configuration.',
  );
}
