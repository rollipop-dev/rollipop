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

export interface ServeAssetPluginOptions {
  context: DevServerContext;
}

const plugin = fp<ServeAssetPluginOptions>(
  (fastify, options) => {
    const { context } = options;
    const { host, port, https } = context.options;
    const baseUrl = https ? `https://${host}:${port}` : `http://${host}:${port}`;

    function resolveAsset(asset: string) {
      return path.resolve(context.config.root, asset);
    }

    // TODO
    fastify.get<{ Querystring: QueryParams }>(`/${DEV_SERVER_ASSET_PATH}/*`, {
      schema: {
        querystring: queryParamSchema,
      },
      async handler(request, reply) {
        const { url, query } = request;
        const { pathname } = new URL(url, baseUrl);
        const assetPath = resolveAsset(
          pathname.replace(new RegExp(`^/${DEV_SERVER_ASSET_PATH}/?`), ''),
        );

        let handle: fs.promises.FileHandle | null = null;
        try {
          const resolvedAssetPath = AssetUtils.resolveAssetPath(assetPath, {
            platform: query.platform,
            preferNativePlatform: context.config.resolver.preferNativePlatform,
          });
          handle = await fs.promises.open(resolvedAssetPath, 'r');
          const assetData = await handle.readFile();
          const { size } = await handle.stat();

          await reply
            .header('Content-Type', mime.getType(resolvedAssetPath) ?? '')
            .header('Content-Length', size)
            .send(assetData);
        } catch (error) {
          fastify.log.error(error, 'Failed to serve asset');
          await reply.status(500).send();
        } finally {
          await handle?.close();
        }
      },
    });
  },
  { name: 'serve-assets' },
);

export { plugin as serveAssets };
