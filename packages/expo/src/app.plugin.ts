import { createRequire } from 'node:module';

import type { ConfigPlugin } from 'expo/config-plugins';

import register from './register';
import { withUpdatesPreload } from './updates';

/** Enable Rollipop for Expo CLI and configure native Expo Updates build scripts. */
const withRollipop: ConfigPlugin = (config) => {
  register(config._internal!.projectRoot);
  const { configureNativeRouter }: typeof import('./router') =
    createRequire(__filename)('./router.cjs');
  configureNativeRouter(config);
  return withUpdatesPreload(config);
};

export default withRollipop;
