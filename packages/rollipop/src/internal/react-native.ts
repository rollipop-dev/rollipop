import path from 'node:path';

import { isNotNil } from 'es-toolkit';

import { asLiteral } from '../common/code';
import type { BuildType } from '../core/types';

export function getInitializeCorePath(basePath: string) {
  return require.resolve('react-native/Libraries/Core/InitializeCore', { paths: [basePath] });
}

export function getPolyfillScriptPaths(reactNativePath: string) {
  const scriptPath = path.join(reactNativePath, 'rn-get-polyfills');
  return (require(scriptPath) as () => string[])();
}

export function getGlobalVariables(dev: boolean, buildType: BuildType) {
  const isDevServerMode = dev && buildType === 'serve';
  return [
    `var __BUNDLE_START_TIME__ = globalThis.nativePerformanceNow ? nativePerformanceNow() : Date.now();`,
    `var __DEV__ = ${asLiteral(dev)};`,
    `var process = globalThis.process || {};`,
    'process.env = process.env || {};',
    `process.env.NODE_ENV = process.env.NODE_ENV || ${asLiteral(dev ? 'development' : 'production')};`,
    isDevServerMode ? `var $RefreshReg$ = () => {};` : null,
    isDevServerMode ? `var $RefreshSig$ = () => (v) => v;` : null,
  ].filter(isNotNil);
}
