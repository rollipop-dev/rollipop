import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function setupDefaultToolLauncher() {
  // Mock DefaultToolLauncher to avoid the error:
  // Error: DefaultToolLauncher must be mocked or overridden in tests.
  //        Add jest.mock('../utils/DefaultAppLauncher') to test setup.
  const devMiddlewareDir = path.dirname(require.resolve('@react-native/dev-middleware'));
  const defaultToolLauncherPath = path.join(devMiddlewareDir, 'utils', 'DefaultToolLauncher.js');
  const defaultToolLauncher = {
    launchDebuggerAppWindow: () => Promise.resolve(),
    launchDebuggerShell: () => Promise.resolve(),
    prepareDebuggerShell: () => Promise.resolve({ code: 'not_implemented' }),
  };

  require.cache[defaultToolLauncherPath] = {
    id: defaultToolLauncherPath,
    path: path.dirname(defaultToolLauncherPath),
    exports: {
      __esModule: true,
      default: defaultToolLauncher,
    },
    filename: defaultToolLauncherPath,
    loaded: true,
    children: [],
    paths: require.resolve.paths(defaultToolLauncherPath) ?? [],
  } as unknown as NodeJS.Module;
}

setupDefaultToolLauncher();
