import { rozenite } from '@rollipop/plugin-rozenite';
import { svg } from '@rollipop/plugin-svg';
import { defineConfig, type PluginOption } from 'rollipop';

import { config, hot } from './plugins';

function myPlugin(): PluginOption {
  return [hot(), config()];
}

export default defineConfig({
  entry: 'index.js',
  analyzer: {
    enabled: true,
    autoOpen: true,
  },
  plugins: [
    svg(),
    myPlugin(),
    rozenite({ enabled: process.env.WITH_ROZENITE === 'true', logLevel: 'debug' }),
  ],
  terminal: {
    extraCommands: [
      {
        key: 'a',
        description: 'My custom command 1',
        handler: () => {
          console.log('My custom command 1');
        },
      },
      {
        key: 'a',
        shift: true,
        description: 'My custom command 2',
        handler: () => {
          console.log('My custom command 2');
        },
      },
    ],
  },
  experimental: {
    nativeTransformPipeline: true,
    worklets: {},
  },
});
