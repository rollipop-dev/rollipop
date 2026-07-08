import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'rollipop';

export default defineConfig({
  runtimeTarget: 'hermes',
  dev: {
    hmr: {
      // Override the default HMR client implementation with the React Native 0.72 compatible implementation.
      clientImplement: fs.readFileSync(path.resolve('hmr-client.ts'), 'utf-8'),
    },
  },
  experimental: {
    nativeTransformPipeline: true,
    worklets: {},
  },
});
