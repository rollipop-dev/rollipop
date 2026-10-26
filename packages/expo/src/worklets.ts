import { createRequire } from 'node:module';
import path from 'node:path';

import type { PluginConfig } from 'rollipop';
import { satisfies } from 'semver';

export default function createWorkletsConfig(projectRoot: string): PluginConfig {
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  const installed = (name: string): { version: string } | null => {
    try {
      return appRequire(`${name}/package.json`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return null;
      throw error;
    }
  };
  const reanimated = installed('react-native-reanimated');
  const worklets = installed('react-native-worklets');
  if (reanimated && !satisfies(reanimated.version, '>=4.0.0')) {
    throw new Error('@rollipop/expo requires Reanimated 4+ on Expo SDK 55–58');
  }
  if (reanimated && !worklets) {
    throw new Error(
      'Reanimated requires react-native-worklets. Run: npx expo install react-native-reanimated react-native-worklets',
    );
  }
  return worklets ? { experimental: { worklets: {} } } : {};
}
