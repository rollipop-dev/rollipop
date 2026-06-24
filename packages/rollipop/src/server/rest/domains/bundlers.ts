import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getBundler, getBundlers } from '../data';
import { sendNotFound } from '../response';

export interface BundlersRestOptions {
  context: DevServerContext;
}

export const bundlersRest = fp<BundlersRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return getBundlers(context);
    });

    fastify.get<{ Params: { bundlerId: string } }>('/:bundlerId', (request, reply) => {
      const bundler = getBundler(context, request.params.bundlerId);

      if (bundler == null) {
        return sendNotFound(reply, `Bundler not found: ${request.params.bundlerId}`);
      }

      return bundler;
    });

    fastify.post<{ Params: { bundlerId: string } }>(
      '/:bundlerId/trigger-full-build',
      async (request, reply) => {
        const bundler = context.bundlerPool.getInstanceById(request.params.bundlerId);

        if (bundler == null) {
          return sendNotFound(reply, `Bundler not found: ${request.params.bundlerId}`);
        }

        setTimeout(() => context.message.broadcast('reload'), 0);
        await bundler.triggerFullBuild();

        return {
          triggered: true,
          bundlerId: bundler.id,
        };
      },
    );
  },
  { name: 'rest-bundlers', encapsulate: true },
);
