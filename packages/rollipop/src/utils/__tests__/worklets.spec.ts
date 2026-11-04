import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vite-plus/test';

import type { WorkletsConfig } from '../../config';
import { createTestConfig } from '../../testing/config';
import { transformWithRollipop } from '../transform';
import { resolveWorkletsConfig } from '../worklets';

describe('resolveWorkletsConfig', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-worklets-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function installPackage(name: string, version: string) {
    const packageRoot = path.join(root, 'node_modules', name);
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version }));
  }

  it('accepts detected or explicit versions while keeping the runtimes mutually exclusive', () => {
    expectTypeOf<{}>().toExtend<WorkletsConfig>();
    expectTypeOf<{ pluginVersion: string }>().toExtend<WorkletsConfig>();
    expectTypeOf<{ reanimatedVersion: string }>().toExtend<WorkletsConfig>();
    expectTypeOf<{
      pluginVersion: string;
      reanimatedVersion: string;
    }>().not.toExtend<WorkletsConfig>();
  });

  it('leaves the transform disabled when no worklets configuration is provided', () => {
    expect(resolveWorkletsConfig(undefined, { root, mode: 'development' })).toBeUndefined();
  });

  it.each(['3.19.1', '3.20.0-nightly-20261001'])(
    'selects Reanimated %s even when Worklets is also installed',
    (version) => {
      installPackage('react-native-reanimated', version);
      installPackage('react-native-worklets', '0.8.0');

      expect(resolveWorkletsConfig({}, { root, mode: 'development' })).toEqual({
        isRelease: false,
        reanimatedVersion: version,
      });
    },
  );

  it.each([undefined, '4.1.0', '2.17.0'])(
    'selects Worklets when the Reanimated version is %s',
    (reanimatedVersion) => {
      if (reanimatedVersion) {
        installPackage('react-native-reanimated', reanimatedVersion);
      }
      installPackage('react-native-worklets', '0.8.0');

      expect(resolveWorkletsConfig({}, { root, mode: 'development' })).toEqual({
        isRelease: false,
        pluginVersion: '0.8.0',
      });
    },
  );

  it.each([
    { pluginVersion: '0.9.0', strictGlobal: true },
    { reanimatedVersion: '3.18.0', processNestedWorklets: true },
  ] satisfies WorkletsConfig[])('preserves explicit runtime configuration %j', (worklets) => {
    installPackage('react-native-reanimated', '3.19.1');
    installPackage('react-native-worklets', '0.8.0');

    expect(resolveWorkletsConfig(worklets, { root, mode: 'development' })).toEqual({
      isRelease: false,
      ...worklets,
    });
  });

  it.each([
    { mode: 'development', isRelease: undefined, expected: false },
    { mode: 'production', isRelease: undefined, expected: true },
    { mode: 'development', isRelease: true, expected: true },
    { mode: 'production', isRelease: false, expected: false },
  ] as const)('resolves release mode for %j', ({ mode, isRelease, expected }) => {
    const worklets: WorkletsConfig = { reanimatedVersion: '3.19.1', isRelease };

    expect(resolveWorkletsConfig(worklets, { root, mode })).toEqual({
      isRelease: expected,
      reanimatedVersion: '3.19.1',
    });
  });

  it('preserves options without mutating the input configuration', () => {
    installPackage('react-native-reanimated', '3.19.1');
    const worklets = Object.freeze({ globals: ['customGlobal'], processNestedWorklets: true });

    expect(resolveWorkletsConfig(worklets, { root, mode: 'production' })).toEqual({
      ...worklets,
      isRelease: true,
      reanimatedVersion: '3.19.1',
    });
    expect(worklets).toEqual({ globals: ['customGlobal'], processNestedWorklets: true });
  });

  it.each([undefined, '2.17.0', '4.1.0'])(
    'rejects a missing supported runtime when the Reanimated version is %s',
    (reanimatedVersion) => {
      if (reanimatedVersion) {
        installPackage('react-native-reanimated', reanimatedVersion);
      }

      expect(() => resolveWorkletsConfig({}, { root, mode: 'development' })).toThrow(
        /react-native-reanimated 3\.x or react-native-worklets/,
      );
    },
  );

  it.each([
    ['react-native-reanimated', '3.19.1', 'version: "3.19.1"'],
    ['react-native-worklets', '0.8.0', '.__pluginVersion = "0.8.0"'],
  ] as const)(
    'emits %s runtime metadata through the native transformer',
    (name, version, metadata) => {
      installPackage(name, version);
      const config = createTestConfig(root);
      config.experimental.worklets = {};

      const result = transformWithRollipop(
        path.join(root, 'worklet.js'),
        'export function worklet() { "worklet"; return 42; }',
        config,
      );

      expect(result.code).toContain('.__workletHash = ');
      expect(result.code).toContain(metadata);
    },
  );
});
