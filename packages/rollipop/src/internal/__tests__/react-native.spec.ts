import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { getDefaultConfig } from '../../config/defaults';
import { resolveReactNativeRuntime } from '../react-native';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('React Native runtime modules', () => {
  it.each(['0.88.0-rc.0', '0.88.0'])(
    'uses public runtime entry points for React Native %s without InitializeCore',
    (version) => {
      const projectRoot = createProject();
      const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
      const setupEnvironmentPath = path.join(reactNativePath, 'src/setup-env.js');
      const assetRegistryPath = path.join(reactNativePath, 'src/asset-registry.js');
      const polyfillPath = path.join(
        projectRoot,
        'node_modules/@react-native/metro-config/node_modules/@react-native/js-polyfills/console.js',
      );

      writeJson(path.join(reactNativePath, 'package.json'), {
        name: 'react-native',
        version,
        exports: {
          './asset-registry': './src/asset-registry.js',
          './setup-env': './src/setup-env.js',
        },
      });
      writeFile(setupEnvironmentPath);
      writeFile(assetRegistryPath);

      const metroConfigPath = path.join(projectRoot, 'node_modules/@react-native/metro-config');
      const polyfillsPath = path.join(metroConfigPath, 'node_modules/@react-native/js-polyfills');
      writeJson(path.join(metroConfigPath, 'package.json'), {
        name: '@react-native/metro-config',
        main: 'index.js',
      });
      writeFile(path.join(metroConfigPath, 'index.js'));
      writeJson(path.join(polyfillsPath, 'package.json'), {
        name: '@react-native/js-polyfills',
        main: 'index.js',
      });
      writeFile(
        path.join(polyfillsPath, 'index.js'),
        `module.exports = () => [require.resolve('./console.js')];`,
      );
      writeFile(polyfillPath);

      const runtime = resolveReactNativeRuntime(projectRoot, reactNativePath);
      expect(runtime.prelude).toEqual([fs.realpathSync(setupEnvironmentPath)]);
      expect(runtime.assetRegistryPath).toBe('react-native/asset-registry');
      expect(runtime.polyfills).toEqual([fs.realpathSync(polyfillPath)]);
    },
  );

  it.each(['0.72.17', '0.84.1', '0.86.3'])(
    'preserves legacy runtime entry points for React Native %s',
    (version) => {
      const projectRoot = createProject();
      const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
      const initializeCorePath = path.join(reactNativePath, 'Libraries/Core/InitializeCore.js');
      const polyfillPath = path.join(reactNativePath, 'polyfill.js');

      writeJson(path.join(reactNativePath, 'package.json'), {
        name: 'react-native',
        version,
        main: 'index.js',
      });
      writeFile(path.join(reactNativePath, 'index.js'));
      writeFile(initializeCorePath);
      writeFile(
        path.join(reactNativePath, 'rn-get-polyfills.js'),
        `module.exports = () => [require.resolve('./polyfill.js')];`,
      );
      writeFile(polyfillPath);
      writeFile(path.join(reactNativePath, 'Libraries/Image/AssetRegistry.js'));

      // An unrelated public-looking file must not change an older RN's strategy.
      writeFile(path.join(reactNativePath, 'setup-env.js'));
      const runtime = resolveReactNativeRuntime(projectRoot, reactNativePath);
      expect(runtime.prelude).toEqual([fs.realpathSync(initializeCorePath)]);
      expect(runtime.assetRegistryPath).toBe('react-native/Libraries/Image/AssetRegistry.js');
      expect(runtime.polyfills).toEqual([fs.realpathSync(polyfillPath)]);
    },
  );

  it.each(['0.87.0-rc.0', '0.87.0-rc.1', '0.87.0', '0.87.1'])(
    'keeps InitializeCore with the public asset registry for RN %s even when setup-env exists',
    (version) => {
      const projectRoot = createProject();
      const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
      const initializeCorePath = path.join(reactNativePath, 'Libraries/Core/InitializeCore.js');
      writeJson(path.join(reactNativePath, 'package.json'), {
        name: 'react-native',
        version,
        exports: {
          './asset-registry': './src/asset-registry.js',
          './setup-env': './src/setup-env.js',
        },
      });
      writeFile(initializeCorePath);
      writeFile(path.join(reactNativePath, 'src/asset-registry.js'));
      writeFile(path.join(reactNativePath, 'src/setup-env.js'));
      writeFile(path.join(reactNativePath, 'rn-get-polyfills.js'), 'module.exports = () => [];');

      const runtime = resolveReactNativeRuntime(projectRoot, reactNativePath);
      expect(runtime.prelude).toEqual([fs.realpathSync(initializeCorePath)]);
      expect(runtime.assetRegistryPath).toBe('react-native/asset-registry');
    },
  );

  it('builds the injection plan from the configured RN package and direct polyfill provider', async () => {
    const projectRoot = createProject();
    const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
    const setupEnvironmentPath = path.join(reactNativePath, 'src/setup-env.js');
    writeJson(path.join(reactNativePath, 'package.json'), {
      name: 'react-native',
      version: '0.88.0',
      exports: {
        './package.json': './package.json',
        './setup-env': './src/setup-env.js',
      },
    });
    writeFile(setupEnvironmentPath);
    const polyfillsPath = path.join(reactNativePath, 'node_modules/@react-native/js-polyfills');
    writeJson(path.join(polyfillsPath, 'package.json'), {
      name: '@react-native/js-polyfills',
      main: 'index.js',
    });
    writeFile(
      path.join(polyfillsPath, 'index.js'),
      `module.exports = () => [require.resolve('./console.js')];`,
    );
    writeFile(path.join(polyfillsPath, 'console.js'), 'globalThis.polyfillReady = true;');

    const config = await getDefaultConfig(projectRoot);
    expect(config.prelude).toEqual([fs.realpathSync(setupEnvironmentPath)]);
    expect(config.polyfills).toEqual([
      expect.objectContaining({ type: 'iife', code: expect.stringContaining('polyfillReady') }),
    ]);
  });

  it('does not fall back to deprecated internals when a modern installation is incomplete', () => {
    const projectRoot = createProject();
    const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
    writeJson(path.join(reactNativePath, 'package.json'), {
      name: 'react-native',
      version: '0.88.0',
    });
    writeFile(path.join(reactNativePath, 'Libraries/Core/InitializeCore.js'));
    expect(() => resolveReactNativeRuntime(projectRoot, reactNativePath)).toThrow(
      /react-native\/setup-env/,
    );
  });
});

function createProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-react-native-'));
  temporaryDirectories.push(projectRoot);
  return projectRoot;
}

function writeFile(filePath: string, contents = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, JSON.stringify(value));
}
