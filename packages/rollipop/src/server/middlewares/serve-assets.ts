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
    const projectRoot = path.resolve(context.config.root);
    const workspaceRoot = findWorkspaceRoot(projectRoot);
    const assetExtensions = new Set(context.config.resolve.assetExtensions);

    fastify.get<{ Params: RouteParams; Querystring: QueryParams }>(`/${DEV_SERVER_ASSET_PATH}/*`, {
      schema: {
        querystring: queryParamSchema,
      },
      async handler(request, reply) {
        const { params, query } = request;
        const assetPath = path.resolve(projectRoot, params['*']);

        if (!assetExtensions.has(path.extname(assetPath).slice(1))) {
          await reply.status(403).send();
          return;
        }

        try {
          const realWorkspaceRoot = await fs.promises.realpath(workspaceRoot);
          if (!isWithin(realWorkspaceRoot, await fs.promises.realpath(path.dirname(assetPath)))) {
            await reply.status(403).send();
            return;
          }
          const resolvedAssetPath = AssetUtils.resolveAssetPath(assetPath, {
            platform: query.platform,
            preferNativePlatform: context.config.resolve.preferNativePlatform,
          });
          const realAssetPath = await fs.promises.realpath(resolvedAssetPath);
          if (!isWithin(realWorkspaceRoot, realAssetPath)) {
            await reply.status(403).send();
            return;
          }
          const [assetData, { size }] = await Promise.all([
            fs.promises.readFile(realAssetPath),
            fs.promises.stat(realAssetPath),
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

function isWithin(root: string, file: string) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function findWorkspaceRoot(projectRoot: string) {
  let directory = projectRoot;
  while (true) {
    const packageJson = path.join(directory, 'package.json');
    if (
      fs.existsSync(path.join(directory, 'pnpm-workspace.yaml')) ||
      (fs.existsSync(packageJson) && JSON.parse(fs.readFileSync(packageJson, 'utf-8')).workspaces)
    ) {
      return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return projectRoot;
    }
    directory = parent;
  }
}

export { plugin as serveAssets };
