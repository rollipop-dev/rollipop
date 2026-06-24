import url from 'url';

import { createDevServerMiddleware } from '@react-native-community/cli-server-api';
import { createDevMiddleware } from '@react-native/dev-middleware';
import Fastify from 'fastify';
import mitt from 'mitt';
import type * as ws from 'ws';

import type { ResolvedConfig } from '../config';
import { createPluginContext } from '../core/plugins/context';
import type { Plugin } from '../core/plugins/types';
import type { AsyncResult } from '../core/types';
import { assertDevServerStatus } from '../utils/dev-server';
import { BundlerPool } from './bundler-pool';
import { DEFAULT_HOST, DEFAULT_PORT } from './constants';
import { errorHandler } from './error';
import { ServerEventBus } from './events/event-bus';
import { DevServerLogger, logger } from './logger';
import { mcp } from './mcp/server';
import { dashboard } from './middlewares/dashboard';
import { requestLogger } from './middlewares/request-logger';
import { serveAssets } from './middlewares/serve-assets';
import { serveBundle } from './middlewares/serve-bundle';
import { sse } from './middlewares/sse';
import { symbolicate } from './middlewares/symbolicate';
import { rest } from './rest';
import { toSSEEvent } from './sse/adapter';
import { SSEEventPublisher } from './sse/event-bus';
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

  const eventBus = new ServerEventBus();
  const state = new DevServerState({ eventBus });
  const bundlerPool = new BundlerPool(config, { host, port }, eventBus);
  const ssePublisher = new SSEEventPublisher();
  const reporter = config.reporter;

  eventBus.subscribe((event) => {
    const sseEvent = toSSEEvent(event);
    if (sseEvent != null) {
      ssePublisher.publish(sseEvent);
    }
  });

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

  eventBus.subscribe((event) => {
    switch (event.type) {
      case 'bundle_build_started':
      case 'bundle_build_done':
      case 'bundle_build_failed':
      case 'hmr_failed':
      case 'build_log':
      case 'build_error':
      case 'transform':
      case 'watch_change':
        reporter?.update(event);
        break;

      case 'client_log':
        reportEvent?.(event);
        reporter?.update(event);
        break;

      case 'client_connected':
        emitter.emit('client.connected', { client: event.client });
        break;

      case 'client_message':
        emitter.emit('client.message', { client: event.client, data: event.data });
        break;

      case 'client_error':
        emitter.emit('client.error', { client: event.client, error: event.error });
        break;

      case 'client_disconnected':
        emitter.emit('client.disconnected', { client: event.client });
        break;
    }
  });

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
    .register(symbolicate, { context })
    .register(serveBundle, { context })
    .register(serveAssets, { context })
    .register(rest, { context })
    .register(sse, { context })
    .register(mcp, { context })
    .setErrorHandler(errorHandler);

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
