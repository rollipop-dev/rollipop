import { createRequire } from 'node:module';
import path from 'node:path';

import { resolvePackagePath } from '../../utils/node-resolve';
import type { RuntimeContext } from './runtime';

export function resolvePolyfillScriptPaths({
  projectRoot,
  reactNativePath,
  require,
}: RuntimeContext): string[] {
  const polyfillPath = resolveOptional(() =>
    require.resolve('@react-native/js-polyfills', { paths: [reactNativePath, projectRoot] }),
  );
  if (polyfillPath) {
    return (require(polyfillPath) as () => string[])();
  }

  let metroConfigPath: string | undefined;
  try {
    metroConfigPath = resolvePackagePath(projectRoot, '@react-native/metro-config');
  } catch {}

  if (metroConfigPath) {
    const requireFromMetroConfig = createRequire(path.join(metroConfigPath, 'package.json'));
    const metroPolyfillPath = resolveOptional(() =>
      requireFromMetroConfig.resolve('@react-native/js-polyfills'),
    );
    if (metroPolyfillPath) {
      return (requireFromMetroConfig(metroPolyfillPath) as () => string[])();
    }
  }

  return (require('./rn-get-polyfills') as () => string[])();
}

function resolveOptional(resolve: () => string) {
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
