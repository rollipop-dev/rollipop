import fp from 'fastify-plugin';

import { resetCache } from '../../../utils/reset-cache';
import type { DevServerContext } from '../../types';

export interface ActionsRestOptions {
  context: DevServerContext;
}

export const actionsRest = fp<ActionsRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.post('/reload', () => {
      context.message.broadcast('reload');
      return { reloaded: true };
    });

    fastify.post('/reset-cache', async () => {
      await resetCache();
      context.eventBus.emit({ type: 'cache_reset' });
      return { reset: true };
    });

    fastify.post('/reset-bundler-state', () => {
      context.state.resetBufferedState();
      return { reset: true };
    });
  },
  { name: 'rest-actions', encapsulate: true },
);
