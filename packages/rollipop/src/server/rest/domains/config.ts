import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getConfigInfo } from '../data';

export interface ConfigRestOptions {
  context: DevServerContext;
}

export const configRest = fp<ConfigRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return getConfigInfo(context);
    });
  },
  { name: 'rest-config', encapsulate: true },
);
