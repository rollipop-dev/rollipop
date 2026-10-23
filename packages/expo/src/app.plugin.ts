import type { ConfigPlugin } from 'expo/config-plugins';

import register from './register';
import { configureNativeRouter } from './router';
import { withUpdatesPreload } from './updates';

/** Enable Rollipop for Expo CLI and configure native Expo Updates build scripts. */
const withRollipop: ConfigPlugin = (config) => {
  configureNativeRouter(config);
  register(config._internal!.projectRoot);
  return withUpdatesPreload(config);
};

export default withRollipop;
