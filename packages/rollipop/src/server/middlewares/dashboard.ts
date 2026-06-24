import fs from 'node:fs/promises';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import { staticPath as dashboardStaticPath } from '@rollipop/dashboard';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { SHARED_DATA_PATH } from '../../common/constants';
import { logger } from '../logger';
import type { DevServerContext } from '../types';

const NOT_FOUND_FILE = '404.html';
const INDEX_FILE = 'index.html';
const DASHBOARD_PATH = '/dashboard';
const ANALYZE_DIRECTORY = 'analyze';

export interface DashboardPluginOptions {
  context: DevServerContext;
}

const plugin = fp<DashboardPluginOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.register(fastifyStatic, {
      root: dashboardStaticPath,
      prefix: `${DASHBOARD_PATH}/`,
      index: [INDEX_FILE],
      wildcard: false,
    });

    fastify.get(DASHBOARD_PATH, (_request, reply) => reply.sendFile(INDEX_FILE));

    fastify.get<{ Params: { reportFile: string } }>(
      `${DASHBOARD_PATH}/analyze-report/:reportFile`,
      async (request, reply) => {
        const { reportFile } = request.params;

        if (!reportFile.endsWith('.html')) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_ANALYZE_REPORT_ID',
              message: 'Invalid analyze report id.',
            },
          });
        }

        const reportPath = path.join(
          context.config.root,
          SHARED_DATA_PATH,
          ANALYZE_DIRECTORY,
          reportFile,
        );

        try {
          await fs.access(reportPath);
          const report = await fs.readFile(reportPath);

          return reply.type('text/html; charset=utf-8').send(report);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return reply.status(404).send({
              error: {
                code: 'ANALYZE_REPORT_NOT_FOUND',
                message: `Analyze report not found: ${reportFile}`,
              },
            });
          }

          throw error;
        }
      },
    );

    fastify.addHook('onListen', () => {
      const dashboardPath = context.serverBaseUrl + DASHBOARD_PATH;
      logger.info(`Dashboard is available at ${dashboardPath}`);
    });

    fastify.setNotFoundHandler((request, reply) => {
      if (shouldServeNotFoundPage(request)) {
        return reply.status(404).sendFile(NOT_FOUND_FILE);
      }

      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Not Found',
      });
    });
  },
  { name: 'dashboard' },
);

function shouldServeNotFoundPage(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  const accept = request.headers.accept;

  return typeof accept === 'string' && accept.includes('text/html');
}

export { plugin as dashboard };
