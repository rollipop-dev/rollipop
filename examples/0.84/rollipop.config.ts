import { createPluginFromDevframe } from '@rollipop/devtools-kit/node';
import { rozenite } from '@rollipop/plugin-rozenite';
import { svg } from '@rollipop/plugin-svg';
import { defineConfig, type PluginOption } from 'rollipop';

import { counterDevframe } from './devtools/counter';
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
  transform: {
    jsx: {
      compiler: {},
    },
  },
  plugins: [
    svg(),
    myPlugin(),
    createPluginFromDevframe(counterDevframe, {
      base: '/__rollipop/counter/',
      dock: {
        category: 'project',
        title: 'Shared Counter',
      },
    }),
    rozenite({ enabled: process.env.WITH_ROZENITE === 'true', logLevel: 'debug' }),
  ],
  commands: [
    {
      key: 'a',
      description: 'Custom command 1',
      handler() {
        this.logger.info('Custom command 1');
      },
    },
    {
      key: 'a',
      shift: true,
      description: 'Custom command 2',
      handler() {
        this.logger.info('Custom command 2');
      },
    },
  ],
  experimental: {
    worklets: {},
  },
});
