import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { version } from '../../package.json' with { type: 'json' };
import { detectProject, setupExpoConfig, setupPackage } from '../init';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-init-expo-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(filename: string, value: unknown) {
  fs.writeFileSync(path.join(tmpDir, filename), JSON.stringify(value, null, 2) + '\n');
}

function readJson(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, filename), 'utf8'));
}

describe('detectProject', () => {
  it.each(['dependencies', 'devDependencies'])('detects Expo in %s', (field) => {
    writeJson('package.json', { [field]: { expo: '~58.0.17' } });
    expect(detectProject(tmpDir)).toBe('expo');
  });

  it('keeps prebuilt Expo projects on the Expo setup path', () => {
    writeJson('package.json', { dependencies: { expo: '~58.0.17', 'react-native': '0.88.0' } });
    fs.mkdirSync(path.join(tmpDir, 'ios'));
    fs.mkdirSync(path.join(tmpDir, 'android'));
    expect(detectProject(tmpDir)).toBe('expo');
  });

  it('does not mistake a bare app.json for an Expo project', () => {
    writeJson('package.json', { dependencies: { 'react-native': '0.88.0' } });
    writeJson('app.json', { name: 'BareApp', displayName: 'Bare App' });
    expect(detectProject(tmpDir)).toBe('bare');
  });
});

describe('setupExpoConfig', () => {
  it('adds the plugin while preserving Router and the rest of the configuration', () => {
    const expo = {
      name: 'Expo App',
      slug: 'expo-app',
      plugins: ['expo-router', ['expo-splash-screen', { backgroundColor: '#ffffff' }]],
      experiments: { reactCompiler: true },
    };
    writeJson('app.json', { expo });

    expect(setupExpoConfig(tmpDir)).toEqual({ status: 'updated', filename: 'app.json' });
    expect(readJson('app.json')).toEqual({
      expo: { ...expo, plugins: [...expo.plugins, '@rollipop/expo'] },
    });
    expect(fs.existsSync(path.join(tmpDir, 'react-native.config.js'))).toBe(false);
  });

  it.each([{ plugin: '@rollipop/expo' }, { plugin: ['@rollipop/expo', {}] }])(
    'does not duplicate an existing plugin entry: %j',
    ({ plugin }) => {
      writeJson('app.json', { expo: { plugins: [plugin] } });
      const before = fs.readFileSync(path.join(tmpDir, 'app.json'), 'utf8');
      expect(setupExpoConfig(tmpDir)).toEqual({
        status: 'already-configured',
        filename: 'app.json',
      });
      expect(fs.readFileSync(path.join(tmpDir, 'app.json'), 'utf8')).toBe(before);
    },
  );

  it('creates app.json when there is no Expo configuration', () => {
    expect(setupExpoConfig(tmpDir)).toEqual({ status: 'created', filename: 'app.json' });
    expect(readJson('app.json')).toEqual({ expo: { plugins: ['@rollipop/expo'] } });
    expect(setupExpoConfig(tmpDir).status).toBe('already-configured');
  });

  it('supports an unwrapped Expo config and prefers app.config.json over app.json', () => {
    writeJson('app.config.json', { name: 'Expo App', slug: 'expo-app' });
    writeJson('app.json', { expo: { name: 'Unused' } });
    expect(setupExpoConfig(tmpDir)).toEqual({ status: 'updated', filename: 'app.config.json' });
    expect(readJson('app.config.json')).toEqual({
      name: 'Expo App',
      slug: 'expo-app',
      plugins: ['@rollipop/expo'],
    });
    expect(readJson('app.json')).toEqual({ expo: { name: 'Unused' } });
  });

  it.each(['ts', 'mts', 'cts', 'mjs', 'cjs', 'js'])(
    'preserves app.config.%s and does not silently update an overridden app.json',
    (extension) => {
      const filename = `app.config.${extension}`;
      const source = 'module.exports = ({ config }) => ({ ...config, plugins: [] });\n';
      fs.writeFileSync(path.join(tmpDir, filename), source);
      writeJson('app.json', { expo: { name: 'Expo App' } });

      expect(setupExpoConfig(tmpDir)).toEqual({ status: 'manual-required', filename });
      expect(fs.readFileSync(path.join(tmpDir, filename), 'utf8')).toBe(source);
      expect(readJson('app.json')).toEqual({ expo: { name: 'Expo App' } });
    },
  );

  it.each([
    { config: { expo: { plugins: 'expo-router' } } },
    { config: { expo: null } },
    { config: { expo: [] } },
    { config: null },
    { config: [] },
  ])('rejects invalid configuration without overwriting it: %j', ({ config }) => {
    writeJson('app.json', config);
    const before = fs.readFileSync(path.join(tmpDir, 'app.json'), 'utf8');
    expect(() => setupExpoConfig(tmpDir)).toThrow();
    expect(fs.readFileSync(path.join(tmpDir, 'app.json'), 'utf8')).toBe(before);
  });
});

describe('Expo dependencies', () => {
  it.each([{}, { '@rollipop/expo': version }])(
    'adds matching core and adapter versions while preserving dependencies: %j',
    (installed) => {
      const dependencies = { expo: '~58.0.17', 'expo-router': '~58.0.25' };
      writeJson('package.json', {
        dependencies,
        devDependencies: { typescript: '~5.9.2', ...installed },
      });

      setupPackage(tmpDir);

      expect(readJson('package.json')).toEqual({
        dependencies,
        devDependencies: { typescript: '~5.9.2', rollipop: version, '@rollipop/expo': version },
      });
    },
  );
});

describe.each([false, true])('initializer CLI (color: %s)', (color) => {
  function runInit() {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('@oxc-node/core/register'),
        fileURLToPath(new URL('../index.ts', import.meta.url)),
      ],
      {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          FORCE_COLOR: color ? '1' : undefined,
          NO_COLOR: color ? undefined : '1',
        },
      },
    );
    return stripVTControlCharacters(output);
  }

  it('logs bare detection and sets up the React Native CLI', () => {
    writeJson('package.json', { dependencies: { 'react-native': '0.88.0' } });
    const output = runInit();
    expect(output).toContain('bare project detected');
    expect(output).toContain('Setup completed!');
    expect(readJson('package.json').devDependencies).toEqual({ rollipop: version });
    expect(fs.readFileSync(path.join(tmpDir, 'react-native.config.js'), 'utf8')).toContain(
      "commands: require('rollipop/commands')",
    );
    expect(fs.existsSync(path.join(tmpDir, 'app.json'))).toBe(false);
  });

  it('logs Expo detection and remains idempotent on a second run', () => {
    writeJson('package.json', { dependencies: { expo: '~58.0.17' } });
    writeJson('app.json', { expo: { plugins: ['expo-router'] } });
    const output = runInit();
    expect(output).toContain('expo project detected');
    expect(output).toContain('Added rollipop, @rollipop/expo to devDependencies');
    expect(runInit()).toContain('app.json already configured');
    expect(readJson('package.json').devDependencies).toEqual({
      rollipop: version,
      '@rollipop/expo': version,
    });
    expect(readJson('app.json').expo.plugins).toEqual(['expo-router', '@rollipop/expo']);
    expect(fs.existsSync(path.join(tmpDir, 'react-native.config.js'))).toBe(false);
  });

  it('explains the manual step for dynamic Expo config without claiming completion', () => {
    writeJson('package.json', { dependencies: { expo: '~58.0.17' } });
    fs.writeFileSync(path.join(tmpDir, 'app.config.ts'), 'export default { plugins: [] };\n');
    const output = runInit();
    expect(output).toContain('expo project detected');
    expect(output).toContain('app.config.ts');
    expect(output).toContain("Add '@rollipop/expo' to the exported config's plugins array");
    expect(output).toContain('Manual configuration is required to finish setup.');
    expect(output).not.toContain('Setup completed!');
    expect(readJson('package.json').devDependencies).toEqual({
      rollipop: version,
      '@rollipop/expo': version,
    });
    expect(fs.existsSync(path.join(tmpDir, 'app.json'))).toBe(false);
  });
});
