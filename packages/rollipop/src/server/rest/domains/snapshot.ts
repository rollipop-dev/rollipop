import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getSnapshot } from '../data';

export interface SnapshotRestOptions {
  context: DevServerContext;
}

export const snapshotRest = fp<SnapshotRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return getSnapshot(context);
    });
  },
  { name: 'rest-snapshot', encapsulate: true },
);
