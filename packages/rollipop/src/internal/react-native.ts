import path from 'node:path';

import { isNotNil } from 'es-toolkit';

import { asLiteral } from '../common/code';

export function getInitializeCorePath(_basePath: string) {
  // Emit the bare specifier so rollipop's resolver can locate react-native's
  // InitializeCore the same way it resolves every other `react-native/*` import
  // (including inside pnpm's nested .pnpm layout). Returning an absolute path
  // from `require.resolve` breaks dev-server on-demand bundling, where the
  // resolver cannot follow the pnpm-nested absolute path.
  return 'react-native/Libraries/Core/InitializeCore';
}

export function getPolyfillScriptPaths(reactNativePath: string) {
  const scriptPath = path.join(reactNativePath, 'rn-get-polyfills');
  return (require(scriptPath) as () => string[])();
}

export function getGlobalVariables(dev: boolean) {
  return [
    `var __BUNDLE_START_TIME__ = globalThis.nativePerformanceNow ? nativePerformanceNow() : Date.now();`,
    `var __DEV__ = ${asLiteral(dev)};`,
    `var process = globalThis.process || {};`,
    'process.env = process.env || {};',
    `process.env.NODE_ENV = process.env.NODE_ENV || ${asLiteral(dev ? 'development' : 'production')};`,
  ].filter(isNotNil);
}
