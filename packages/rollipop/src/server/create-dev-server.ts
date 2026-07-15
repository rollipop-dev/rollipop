import url from 'node:url';

import { createDevServerMiddleware } from '@react-native-community/cli-server-api';
import { createDevMiddleware } from '@react-native/dev-middleware';
import Fastify from 'fastify';
import mitt from 'mitt';
import type * as ws from 'ws';

import type { ResolvedConfig } from '../config';
import { createPluginContext } from '../core/plugins/context';
import type { Plugin } from '../core/plugins/types';
import type { AsyncResult } from '../core/types';
import {
  createDevServerEventListener,
  createReactNativeEventListener,
  createReporterEventListener,
} from '../events/consumers';
import { EventBus } from '../events/event-bus';
import { assertDevServerStatus } from '../utils/dev-server';
import { BundlerPool } from './bundler-pool';
import { DEFAULT_HOST, DEFAULT_PORT } from './constants';
import { errorHandler } from './error';
import { DevServerLogger, logger } from './logger';
import { dashboard } from './middlewares/dashboard';
import { requestLogger } from './middlewares/request-logger';
import { serveAssets } from './middlewares/serve-assets';
import { serveBundle } from './middlewares/serve-bundle';
import { serveHotUpdates } from './middlewares/serve-hot-updates';
import { sse } from './middlewares/sse';
import { symbolicate } from './middlewares/symbolicate';
import { rest } from './rest';
import { DevServerState } from './state/store';
import type { DevServer, DevServerContext, DevServerEvents, ServerOptions } from './types';
import { HMRServer } from './wss/hmr-server';
import { getWebSocketUpgradeHandler } from './wss/server';

export async function createDevServer(
  config: ResolvedConfig,
  options?: ServerOptions,
): Promise<DevServer> {
  const projectRoot = config.root;
  const { port = DEFAULT_PORT, host = DEFAULT_HOST, https = false } = options ?? {};

  if (https) {
    throw new Error('HTTPS is not supported yet');
  }

  const serverBaseUrl = url.format({ protocol: https ? 'https' : 'http', hostname: host, port });
  await assertDevServerStatus({ devServerUrl: serverBaseUrl, projectRoot, port });

  const emitter = mitt<DevServerEvents>();
  const fastify = Fastify({
    loggerInstance: new DevServerLogger(),
    disableRequestLogging: true,
  });

  const eventBus = new EventBus();
  const state = new DevServerState({ eventBus });
  const bundlerPool = new BundlerPool(config, { host, port }, eventBus);

  const {
    middleware: communityMiddleware,
    websocketEndpoints: communityWebsocketEndpoints,
    messageSocketEndpoint: { server: messageServer, broadcast },
    eventsSocketEndpoint: { server: eventsServer, reportEvent },
  } = createDevServerMiddleware({
    port,
    host,
    watchFolders: [],
  });

  eventBus.subscribe(createReporterEventListener(config.reporter));
  eventBus.subscribe(createReactNativeEventListener(reportEvent));
  eventBus.subscribe(createDevServerEventListener(emitter));

  const { middleware: devMiddleware, websocketEndpoints } = createDevMiddleware({
    serverBaseUrl,
    logger: {
      info(...args) {
        if (args[0].includes('JavaScript logs have moved')) {
          return;
        }
        logger.info(...args);
      },
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger),
    },
    unstable_experiments: {
      enableNetworkInspector: true,
      enableStandaloneFuseboxShell: true,
    },
  });

  const hmrServer = new HMRServer({
    bundlerPool,
    eventBus,
  })
    .on('connection', (client) => eventBus.emit({ type: 'client_connected', client }))
    .on('message', (client, data) => eventBus.emit({ type: 'client_message', client, data }))
    .on('error', (client, error) => eventBus.emit({ type: 'client_error', client, error }))
    .on('close', (client) => eventBus.emit({ type: 'client_disconnected', client }));

  await fastify.register(import('@fastify/middie'));

  const context: DevServerContext = {
    serverBaseUrl,
    config: Object.freeze(config),
    options: Object.freeze(options ?? {}),
    bundlerPool,
    eventBus,
    state,
    message: Object.assign(messageServer, { broadcast }),
    events: Object.assign(eventsServer, { reportEvent }),
    hot: Object.assign(hmrServer.server, {
      send: (client: ws.WebSocket, eventName: string, payload?: unknown) => {
        hmrServer.send(client, JSON.stringify({ type: eventName, payload }));
      },
      sendAll: (eventName: string, payload?: unknown) => {
        hmrServer.sendAll(JSON.stringify({ type: eventName, payload }));
      },
    }),
  };

  const devServer: DevServer = {
    ...context,
    ...emitter,
    instance: fastify,
    middlewares: { use: fastify.use.bind(fastify) },
  };

  const { invokePostConfigureServer } = await invokeConfigureServer(
    devServer,
    config.plugins ?? [],
  );

  fastify
    .use(requestLogger)
    .use(communityMiddleware)
    .use(devMiddleware)
    .register(dashboard, { context })
    .register(serveHotUpdates, { hotUpdateStore: bundlerPool.hotUpdateStore })
    .register(symbolicate, { context })
    .register(serveBundle, { context })
    .register(serveAssets, { context })
    .register(rest, { context })
    .register(sse, { context });

  if (options?.mcp === true) {
    const { mcp } = await import('./mcp/server');
    fastify.register(mcp, { context });
  } else {
    fastify.all('/mcp', async (_request, reply) => {
      return reply.status(503).send({
        error: {
          code: 'MCP_DISABLED',
          message: 'MCP server is disabled. Start Rollipop with --mcp to enable it.',
        },
      });
    });
  }

  fastify.setErrorHandler(errorHandler);

  fastify.server.on(
    'upgrade',
    getWebSocketUpgradeHandler({
      ...communityWebsocketEndpoints,
      ...websocketEndpoints,
      '/hot': hmrServer.server,
    }),
  );

  await invokePostConfigureServer();

  eventBus.emit({ type: 'server_ready', host, port });

  return devServer;
}

async function invokeConfigureServer(server: DevServer, plugins: Plugin[]) {
  const postConfigureServerHandlers: (() => AsyncResult<void>)[] = [];

  for (const plugin of plugins) {
    const context = createPluginContext(plugin.name);
    const result = await plugin.configureServer?.call(context, server);

    if (typeof result === 'function') {
      postConfigureServerHandlers.push(result);
    }
  }

  return {
    invokePostConfigureServer: async () => {
      for (const handler of postConfigureServerHandlers) {
        await handler();
      }
    },
  };
}
