import fs from 'node:fs';
import path from 'node:path';

import type { RolldownPluginOption } from '@rollipop/rolldown';
import * as swc from '@swc/core';
import { invariant } from 'es-toolkit';
import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';

import { GLOBAL_IDENTIFIER } from './src/constants';

const rawPackageJson = fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf-8');
const { version } = JSON.parse(rawPackageJson);
invariant(version, 'could not find version in package.json');

const transformToEs5: RolldownPluginOption = {
  name: 'transform-to-es5',
  transform(code, id) {
    const result = swc.transformSync(code, {
      filename: id,
      configFile: false,
      swcrc: false,
      sourceMaps: false,
      inputSourceMap: false,
      jsc: {
        target: 'es5',
        parser: {
          syntax: 'typescript',
        },
        keepClassNames: true,
        loose: false,
        assumptions: {
          setPublicClassFields: true,
          privateFieldsAsProperties: true,
        },
        minify: {
          // To avoid mangling the rolldown runtime variable names
          mangle: true,
        },
      },
      isModule: true,
    });

    return { code: result.code, map: result.map };
  },
};

const commonPackConfig: PackUserConfig = {
  outDir: 'dist',
  define: {
    'globalThis.__ROLLIPOP_VERSION__': JSON.stringify(version),
  },
  fixedExtension: false,
  checks: {
    pluginTimings: false,
  },
};

const runtimePackConfig: PackUserConfig = {
  format: 'esm',
  platform: 'neutral',
  define: {
    globalThis: GLOBAL_IDENTIFIER,
  },
  treeshake: false,
  logLevel: 'error',
  plugins: [transformToEs5],
};

export default defineConfig({
  pack: [
    {
      ...commonPackConfig,
      entry: 'src/index.ts',
      format: 'esm',
      platform: 'node',
      dts: true,
    },
    {
      ...commonPackConfig,
      entry: 'src/commands.ts',
      format: ['esm', 'cjs'],
      platform: 'node',
      dts: true,
    },
    {
      ...commonPackConfig,
      entry: 'src/pluginutils.ts',
      format: 'esm',
      platform: 'node',
      dts: true,
    },
    {
      ...runtimePackConfig,
      entry: 'src/runtime.ts',
      format: ['esm', 'cjs'],
      platform: 'neutral',
      dts: true,
    },
    {
      ...runtimePackConfig,
      format: 'iife',
      entry: 'src/runtime/hmr-runtime.ts',
      deps: {
        alwaysBundle: ['mitt'],
        onlyBundle: false,
      },
    },
  ],
  define: {
    'globalThis.__ROLLIPOP_VERSION__': JSON.stringify('0.0.0'),
  },
  test: {
    globalSetup: ['./e2e/global-setup.ts'],
    hookTimeout: 60_000,
    coverage: {
      include: ['src/**'],
      exclude: [
        '**/dist/**',
        '**/e2e/**',
        '**/testing/**',
        '**/__tests__/**',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
    },
  },
});
