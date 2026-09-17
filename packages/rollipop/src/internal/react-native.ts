import { createRequire } from 'node:module';
import path from 'node:path';

import { isNotNil } from 'es-toolkit';

import { asLiteral } from '../common/code';
import { resolvePackagePath } from '../utils/node-resolve';

const MODERN_ASSET_REGISTRY_PATH = 'react-native/asset-registry';
const LEGACY_ASSET_REGISTRY_PATH = 'react-native/Libraries/Image/AssetRegistry.js';

export function getInitializeCorePath(basePath: string) {
  return (
    resolveOptional('react-native/setup-env', [basePath]) ??
    require.resolve('react-native/Libraries/Core/InitializeCore', { paths: [basePath] })
  );
}

export function getAssetRegistryPath(basePath: string) {
  return resolveOptional(MODERN_ASSET_REGISTRY_PATH, [basePath])
    ? MODERN_ASSET_REGISTRY_PATH
    : LEGACY_ASSET_REGISTRY_PATH;
}

export function getPolyfillScriptPaths(basePath: string, reactNativePath: string) {
  const polyfillPath = resolveOptional('@react-native/js-polyfills', [reactNativePath, basePath]);
  if (polyfillPath) {
    return loadPolyfillScriptPaths(polyfillPath, require);
  }

  let metroConfigPath: string | undefined;
  try {
    metroConfigPath = resolvePackagePath(basePath, '@react-native/metro-config');
  } catch {}

  if (metroConfigPath) {
    const requireFromMetroConfig = createRequire(path.join(metroConfigPath, 'package.json'));
    const metroPolyfillPath = resolveOptionalWith(() =>
      requireFromMetroConfig.resolve('@react-native/js-polyfills'),
    );
    if (metroPolyfillPath) {
      return loadPolyfillScriptPaths(metroPolyfillPath, requireFromMetroConfig);
    }
  }

  const legacyPolyfillPath = require.resolve(path.join(reactNativePath, 'rn-get-polyfills'));
  return loadPolyfillScriptPaths(legacyPolyfillPath, require);
}

function loadPolyfillScriptPaths(modulePath: string, load: NodeJS.Require) {
  return (load(modulePath) as () => string[])();
}

function resolveOptional(moduleId: string, paths: string[]) {
  return resolveOptionalWith(() => require.resolve(moduleId, { paths }));
}

function resolveOptionalWith(resolve: () => string) {
  try {
    return resolve();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
    ) {
      return undefined;
    }
    throw error;
  }
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
