import { createRequire } from 'node:module';
import path from 'node:path';

import { satisfies } from 'semver';

import { legacyRuntime } from './legacy';
import { publicRuntime } from './public';
import { publicAssetsRuntime } from './public-assets';

export interface ReactNativeRuntime {
  prelude: string[];
  polyfills: string[];
  assetRegistryPath: string;
}

export interface RuntimeContext {
  projectRoot: string;
  reactNativePath: string;
  require: NodeJS.Require;
}

export interface RuntimeStrategy {
  range: string;
  resolve(context: RuntimeContext): ReactNativeRuntime;
}

const strategies: RuntimeStrategy[] = [publicRuntime, publicAssetsRuntime, legacyRuntime];

// Select once per project; version-specific entry points and injection policy belong to the strategy, not to config construction or bundler plugins.
export function resolveReactNativeRuntime(projectRoot: string, reactNativePath: string) {
  const require = createRequire(path.join(reactNativePath, 'package.json'));
  const { version } = require('./package.json') as { version: string };
  const strategy = strategies.find(({ range }) =>
    satisfies(version, range, { includePrerelease: true }),
  );
  if (!strategy) {
    throw new Error(`Unsupported React Native version: ${version}`);
  }
  return strategy.resolve({ projectRoot, reactNativePath, require });
}
