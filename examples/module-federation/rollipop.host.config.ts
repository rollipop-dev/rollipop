import path from 'path';

import { federation } from '@rollipop/plugin-module-federation';
import { svg } from '@rollipop/plugin-svg';
import { transformFileSync } from '@swc/core';
import { defineConfig } from 'rollipop';

function transformRuntime(filename: string) {
  const result = transformFileSync(path.resolve(filename), {
    filename,
    configFile: false,
    swcrc: false,
    sourceMaps: false,
    jsc: {
      parser: {
        syntax: 'typescript',
      },
    },
    module: {
      type: 'commonjs',
      strict: false,
      noInterop: true,
    },
  });

  return result.code;
}

export default defineConfig({
  entry: 'src/host/index.ts',
  serializer: {
    polyfills: [{ type: 'iife', code: 'globalThis.window = globalThis;' }],
  },
  plugins: [
    svg(),
    federation({
      name: 'host_app',
      remotes: {
        remote_app: 'remote_app@http://localhost:8082/index.bundle?platform=ios',
      },
      shared: {
        react: { singleton: true, eager: true, requiredVersion: '19.2.3' },
        'react-native': { singleton: true, eager: true, requiredVersion: '0.84.1' },
      },
      runtime: {
        implement: transformRuntime('mf-script-loader.ts'),
      },
    }),
  ],
  experimental: {
    nativeTransformPipeline: true,
    worklets: {},
  },
});
