import { isNotNil } from 'es-toolkit';

import { asLiteral } from '../common/code';

export { resolveReactNativeRuntime } from './react-native/runtime';

export function getGlobalVariables(dev: boolean) {
  return [
    `var __BUNDLE_START_TIME__ = globalThis.nativePerformanceNow ? nativePerformanceNow() : Date.now();`,
    `var __DEV__ = ${asLiteral(dev)};`,
    `var process = globalThis.process || {};`,
    'process.env = process.env || {};',
    `process.env.NODE_ENV = process.env.NODE_ENV || ${asLiteral(dev ? 'development' : 'production')};`,
  ].filter(isNotNil);
}
