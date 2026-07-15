import fp from 'fastify-plugin';
import { asConst, type FromSchema } from 'json-schema-to-ts';

import { HOT_UPDATE_ROUTE_PREFIX, type HotUpdateStore } from '../hot-update-store';

const routeParamSchema = asConst({
  type: 'object',
  properties: {
    id: { type: 'string' },
    filename: { type: 'string' },
  },
  required: ['id', 'filename'],
});

type RouteParams = FromSchema<typeof routeParamSchema>;

export interface ServeHotUpdatesPluginOptions {
  hotUpdateStore: HotUpdateStore;
}

const plugin = fp<ServeHotUpdatesPluginOptions>(
  (fastify, { hotUpdateStore }) => {
    fastify.get<{ Params: RouteParams }>(
      `${HOT_UPDATE_ROUTE_PREFIX}/:id/:filename`,
      { schema: { params: routeParamSchema } },
      async (request, reply) => {
        const { id, filename } = request.params;
        const content = hotUpdateStore.readAsset(id, filename);

        if (content == null) {
          await reply.status(404).send();
          return;
        }

        await reply
          .header('Access-Control-Allow-Origin', 'devtools://devtools')
          .header('Cache-Control', 'no-store')
          .header(
            'Content-Type',
            filename.endsWith('.map')
              ? 'application/json; charset=UTF-8'
              : 'application/javascript; charset=UTF-8',
          )
          .header('Content-Length', content.byteLength)
          .send(content);
      },
    );
  },
  { name: 'serve-hot-updates' },
);

export { plugin as serveHotUpdates };
