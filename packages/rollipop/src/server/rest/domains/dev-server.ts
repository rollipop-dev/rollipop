import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getDevServerStatus } from '../data';

export interface DevServerRestOptions {
  context: DevServerContext;
}

export const devServerRest = fp<DevServerRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/status', () => {
      return getDevServerStatus(context);
    });
  },
  { name: 'rest-dev-server', encapsulate: true },
);
