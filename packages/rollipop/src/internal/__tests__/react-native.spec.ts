import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  getAssetRegistryPath,
  getInitializeCorePath,
  getPolyfillScriptPaths,
} from '../react-native';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('React Native runtime modules', () => {
  it('uses the public React Native 0.87 runtime entry points', () => {
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

    expect(getInitializeCorePath(projectRoot)).toBe(fs.realpathSync(setupEnvironmentPath));
    expect(getAssetRegistryPath(projectRoot)).toBe('react-native/asset-registry');
    expect(getPolyfillScriptPaths(projectRoot, reactNativePath)).toEqual([
      fs.realpathSync(polyfillPath),
    ]);
  });

  it('keeps legacy React Native runtime entry points as fallbacks', () => {
    const projectRoot = createProject();
    const reactNativePath = path.join(projectRoot, 'node_modules/react-native');
    const initializeCorePath = path.join(reactNativePath, 'Libraries/Core/InitializeCore.js');
    const polyfillPath = path.join(reactNativePath, 'polyfill.js');

    writeJson(path.join(reactNativePath, 'package.json'), {
      name: 'react-native',
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

    expect(getInitializeCorePath(projectRoot)).toBe(fs.realpathSync(initializeCorePath));
    expect(getAssetRegistryPath(projectRoot)).toBe('react-native/Libraries/Image/AssetRegistry.js');
    expect(getPolyfillScriptPaths(projectRoot, reactNativePath)).toEqual([
      fs.realpathSync(polyfillPath),
    ]);
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
