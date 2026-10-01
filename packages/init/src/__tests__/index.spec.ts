import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { setupPackage, setupReactNativeConfig } from '../init';

describe('setupReactNativeConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates react-native.config.js when it does not exist', () => {
    const result = setupReactNativeConfig(tmpDir);

    expect(result).toBe('created');
    const content = fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8');
    expect(content).toBe(`module.exports = {\n  commands: require('rollipop/commands'),\n};\n`);
  });

  it('injects commands into existing config without commands', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = {\n  project: {\n    ios: {},\n    android: {},\n  },\n};\n`,
    );

    const result = setupReactNativeConfig(tmpDir);

    expect(result).toBe('updated');
    const content = fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8');
    expect(content).toContain("commands: require('rollipop/commands')");
    expect(content).toContain('project:');
  });

  it('returns already-configured when rollipop commands exist', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = {\n  commands: require('rollipop/commands'),\n};\n`,
    );

    expect(setupReactNativeConfig(tmpDir)).toBe('already-configured');
  });

  it('throws when commands property has a different value', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = {\n  commands: require('other-package/commands'),\n};\n`,
    );

    expect(() => setupReactNativeConfig(tmpDir)).toThrow(
      "'commands' property already exists with a different value",
    );
  });

  it('returns manual-required when export is not an object literal', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = createConfig({ project: {} });\n`,
    );

    expect(setupReactNativeConfig(tmpDir)).toBe('manual-required');
  });

  it('returns manual-required when no module.exports found', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `export default { project: {} };\n`,
    );

    expect(setupReactNativeConfig(tmpDir)).toBe('manual-required');
  });

  it('adds trailing comma when missing', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = {\n  project: {}\n};\n`,
    );

    const result = setupReactNativeConfig(tmpDir);

    expect(result).toBe('updated');
    const content = fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8');
    expect(content).toContain('project: {},');
    expect(content).toContain("commands: require('rollipop/commands')");
  });

  it.each([
    ' // fonts, images',
    ' /* fonts, images */',
    ' /* fonts, images */,',
    ', // fonts, images',
    ' /* 이미지 🖼️, 폰트 */ , // assets, fonts',
  ])('preserves valid configuration with trailing comments: %s', (trailing) => {
    const configPath = path.join(tmpDir, 'react-native.config.js');
    fs.writeFileSync(configPath, `module.exports = {\n  assets: []${trailing}\n};\n`);

    expect(setupReactNativeConfig(tmpDir)).toBe('updated');
    const content = fs.readFileSync(configPath, 'utf8');
    const commands = [{ name: 'bundle' }];
    const module = { exports: {} };
    runInNewContext(content, {
      module,
      require: (id: string) => {
        expect(id).toBe('rollipop/commands');
        return commands;
      },
    });
    expect(module.exports).toEqual({ assets: [], commands });
    for (const comment of trailing.match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g) ?? []) {
      expect(content).toContain(comment);
    }
    expect(setupReactNativeConfig(tmpDir)).toBe('already-configured');
  });

  it('does not double comma when trailing comma exists', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'react-native.config.js'),
      `module.exports = {\n  project: {},\n};\n`,
    );

    const result = setupReactNativeConfig(tmpDir);

    expect(result).toBe('updated');
    const content = fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8');
    expect(content).not.toContain(',,');
  });

  it('handles empty object export', () => {
    fs.writeFileSync(path.join(tmpDir, 'react-native.config.js'), `module.exports = {};\n`);

    const result = setupReactNativeConfig(tmpDir);

    expect(result).toBe('updated');
    const content = fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8');
    expect(content).toContain("commands: require('rollipop/commands')");
  });
});

describe('setupPackage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds rollipop to devDependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', devDependencies: {} }, null, 2),
    );

    setupPackage(tmpDir);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    expect(pkg.devDependencies.rollipop).toBe('latest');
  });

  it('preserves existing devDependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', devDependencies: { typescript: '^5.0.0' } }, null, 2),
    );

    setupPackage(tmpDir);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    expect(pkg.devDependencies.typescript).toBe('^5.0.0');
    expect(pkg.devDependencies.rollipop).toBe('latest');
  });
});
