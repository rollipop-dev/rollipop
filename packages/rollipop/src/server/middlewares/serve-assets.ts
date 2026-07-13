import fs from 'node:fs';
import path from 'node:path';

import fp from 'fastify-plugin';
import { asConst, type FromSchema } from 'json-schema-to-ts';
import mime from 'mime';

import * as AssetUtils from '../../core/assets';
import { DEV_SERVER_ASSET_PATH } from '../constants';
import type { DevServerContext } from '../types';

const queryParamSchema = asConst({
  type: 'object',
  properties: {
    platform: {
      type: 'string',
    },
    hash: {
      type: 'string',
    },
  },
  required: ['platform'],
});

type QueryParams = FromSchema<typeof queryParamSchema>;
type RouteParams = { '*': string };

export interface ServeAssetPluginOptions {
  context: DevServerContext;
}

const plugin = fp<ServeAssetPluginOptions>(
  (fastify, options) => {
    const { context } = options;

    function resolveAsset(asset: string) {
      return path.resolve(context.config.root, asset);
    }

    // TODO
    fastify.get<{ Params: RouteParams; Querystring: QueryParams }>(`/${DEV_SERVER_ASSET_PATH}/*`, {
      schema: {
        querystring: queryParamSchema,
      },
      async handler(request, reply) {
        const { params, query } = request;
        const assetPath = resolveAsset(params['*']);

        try {
          const resolvedAssetPath = AssetUtils.resolveAssetPath(assetPath, {
            platform: query.platform,
            preferNativePlatform: context.config.resolve.preferNativePlatform,
          });
          const [assetData, { size }] = await Promise.all([
            fs.promises.readFile(resolvedAssetPath),
            fs.promises.stat(resolvedAssetPath),
          ]);

          await reply
            .header('Content-Type', mime.getType(resolvedAssetPath) ?? '')
            .header('Content-Length', size)
            .send(assetData);
        } catch (error) {
          fastify.log.error(error, 'Failed to serve asset');
          await reply.status(500).send();
        }
      },
    });
  },
  { name: 'serve-assets' },
);

export { plugin as serveAssets };
