import { federation } from '@rollipop/plugin-module-federation';
import { svg } from '@rollipop/plugin-svg';
import { defineConfig } from 'rollipop';

export default defineConfig({
  entry: 'src/remote/index.ts',
  plugins: [
    svg(),
    federation({
      name: 'remote_app',
      exposes: {
        './Counter': './src/remote/exposed/Counter.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '19.2.3' },
        'react-native': { singleton: true, requiredVersion: '0.84.1' },
      },
    }),
  ],
  experimental: {
    nativeTransformPipeline: true,
    worklets: {},
  },
});
