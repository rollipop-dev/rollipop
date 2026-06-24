import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getBundler } from '../data';
import { sendNotFound } from '../response';

export interface BuildsRestOptions {
  context: DevServerContext;
}

export const buildsRest = fp<BuildsRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return context.state.getBuilds();
    });

    fastify.get<{ Params: { bundlerId: string } }>('/:bundlerId', (request, reply) => {
      const build = context.state.getBuild(request.params.bundlerId);

      if (build == null) {
        return sendNotFound(reply, `Build not found: ${request.params.bundlerId}`);
      }

      return build;
    });

    fastify.get<{ Params: { bundlerId: string } }>('/:bundlerId/logs', (request, reply) => {
      const logs = context.state.getBuildLogs(request.params.bundlerId);

      if (logs == null) {
        const bundler = getBundler(context, request.params.bundlerId);

        if (bundler == null) {
          return sendNotFound(reply, `Build logs not found: ${request.params.bundlerId}`);
        }

        return [];
      }

      return logs;
    });

    fastify.delete<{ Params: { bundlerId: string } }>('/:bundlerId/logs', (request, reply) => {
      const deleted = context.state.clearBuildLogs(request.params.bundlerId);

      if (!deleted) {
        const bundler = getBundler(context, request.params.bundlerId);

        if (bundler == null) {
          return sendNotFound(reply, `Build logs not found: ${request.params.bundlerId}`);
        }
      }

      return {
        deleted: true,
        bundlerId: request.params.bundlerId,
      };
    });
  },
  { name: 'rest-builds', encapsulate: true },
);
