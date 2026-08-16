import { invariant } from 'es-toolkit';
import type { FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { asConst, type FromSchema } from 'json-schema-to-ts';

import { isEventForBundler } from '../../events/utils';
import { BundleResponse } from '../../utils/response';
import { bundleRequestSchema, type BundleRequestSchema } from '../common/schema';
import type { DevServerContext } from '../types';

const routeParamSchema = asConst({
  type: 'object',
  properties: {
    name: {
      type: 'string',
    },
  },
});

type RouteParams = FromSchema<typeof routeParamSchema>;

export interface ServeBundlePluginOptions {
  context: DevServerContext;
}

function withGetBundleErrorHandler<T>(reply: FastifyReply, task: Promise<T>) {
  return task.catch((error) => {
    return reply.status(500).send(error instanceof Error ? error.message : 'Internal Server Error');
  });
}

/**
 * Serve a bundle to a Fastify reply, supporting both the multipart/mixed progress
 * stream (used by the Metro dev client) and a plain `application/javascript`
 * response. Shared by `/:name.bundle` and `/.expo/.virtual-metro-entry.bundle`
 * so the two routes cannot drift apart.
 */
async function serveBundle(
  reply: FastifyReply,
  bundler: ReturnType<DevServerContext['bundlerPool']['get']>,
  accept: string | undefined,
  log: { debug: (msg: string) => void },
  eventBus: DevServerContext['eventBus'],
): Promise<void> {
  const isSupportMultipart = accept?.includes('multipart/mixed') ?? false;

  if (isSupportMultipart) {
    const bundleResponse = new BundleResponse(reply);
    const unsubscribe = eventBus.subscribe((event) => {
      if (isEventForBundler(event, bundler.id) && event.type === 'transform') {
        bundleResponse.writeBundleState(event.transformedModules, event.totalModules ?? 0);
      }
    });

    await bundler
      .getBundle()
      .then((bundle) => bundleResponse.endWithBundle(bundle.code))
      .catch((error) => bundleResponse.endWithError(error))
      .finally(unsubscribe);
  } else {
    log.debug(`client is not support multipart/mixed content: ${accept ?? '<empty>'}`);
    const bundle = await withGetBundleErrorHandler(reply, bundler.getBundle());
    if (!bundle || typeof bundle.code !== 'string') {
      return;
    }
    const code = bundle.code;
    await reply
      .header('Content-Type', 'application/javascript')
      .header('Content-Length', Buffer.byteLength(code))
      .status(200)
      .send(code);
  }
}

const plugin = fp<ServeBundlePluginOptions>(
  (fastify, options) => {
    const { context } = options;

    const getBundleOptions = (buildOptions: BundleRequestSchema) => {
      return {
        platform: buildOptions.platform,
        dev: buildOptions.dev,
        minify: buildOptions.minify,
        sourcemap: buildOptions.inlineSourceMap ? 'inline' : true,
      } as const;
    };

    fastify.get<{ Params: RouteParams; Querystring: BundleRequestSchema }>('/:name.bundle', {
      schema: {
        params: routeParamSchema,
        querystring: bundleRequestSchema,
      },
      async handler(request, reply) {
        const {
          params,
          query,
          headers: { accept },
        } = request;

        if (!params.name) {
          await reply.status(400).send('invalid bundle name');
          return;
        }

        const buildOptions = getBundleOptions(query);
        const bundler = context.bundlerPool.get(params.name, buildOptions);
        await serveBundle(reply, bundler, accept, this.log, context.eventBus);
      },
    });

    // Metro-compatibility alias: Expo Dev Client (and `expo start` consumers)
    // request the bundle at `/.expo/.virtual-metro-entry.bundle`. Serve the same
    // bundle as `/index.bundle` so Dev Client launches work without Metro.
    fastify.get<{ Querystring: BundleRequestSchema }>('/.expo/.virtual-metro-entry.bundle', {
      schema: {
        querystring: bundleRequestSchema,
      },
      async handler(request, reply) {
        const { query, headers } = request;
        const buildOptions = getBundleOptions(query);
        const bundler = context.bundlerPool.get('index', buildOptions);
        await serveBundle(reply, bundler, headers.accept, this.log, context.eventBus);
      },
    });

    fastify.get<{ Params: RouteParams; Querystring: BundleRequestSchema }>('/:name.map', {
      schema: {
        params: routeParamSchema,
        querystring: bundleRequestSchema,
      },
      async handler(request, reply) {
        const { params, query } = request;

        if (!params.name) {
          await reply.status(400).send('invalid bundle name');
          return;
        }

        const buildOptions = getBundleOptions(query);
        const bundler = context.bundlerPool.get(params.name, buildOptions);
        const bundle = await withGetBundleErrorHandler(reply, bundler.getBundle());
        const sourceMap = bundle.sourceMap;
        invariant(sourceMap, 'Source map is not available');

        await reply
          .header('Access-Control-Allow-Origin', 'devtools://devtools')
          .header('Content-Type', 'application/json')
          .header('Content-Length', Buffer.byteLength(sourceMap))
          .status(200)
          .send(sourceMap);
      },
    });
  },
  { name: 'serve-bundle' },
);

export { plugin as serveBundle };
