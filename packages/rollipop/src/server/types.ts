/**
 * @see https://github.com/facebook/metro/blob/0.81.x/packages/metro/src/lib/TerminalReporter.js
 * @see https://github.com/facebook/metro/blob/0.81.x/packages/metro/src/lib/reporting.js
 */

import type * as fastifyMiddie from '@fastify/middie';
import type { FastifyInstance as BaseFastifyInstance } from 'fastify';
import type { Emitter } from 'mitt';
import type * as ws from 'ws';

import type { ResolvedConfig } from '../config';
import type { BuildOptions } from '../core/types';
import type { BundlerPool } from './bundler-pool';
import type { ServerEventBus } from './events/event-bus';
import type { WebSocketClient } from './wss/server';

export type FastifyInstance = BaseFastifyInstance & {
  // `@fastify/middie` extension
  use(fn: fastifyMiddie.Handler): FastifyInstance;
  use(route: string, fn: fastifyMiddie.Handler): FastifyInstance;
  use(routes: string[], fn: fastifyMiddie.Handler): FastifyInstance;
};

export interface ServerOptions {
  port?: number;
  host?: string;
  https?: boolean;
  key?: string;
  cert?: string;
  buildOptions?: Pick<BuildOptions, 'cache'>;
  mcp?: boolean;
}

export interface DevServerContext {
  /**
   * The base URL of the development server.
   */
  serverBaseUrl: string;
  /**
   * Resolved Rollipop config.
   */
  config: ResolvedConfig;
  /**
   * Server options.
   */
  options: ServerOptions;
  /**
   * The bundler pool.
   */
  bundlerPool: BundlerPool;
  /**
   * The event bus.
   */
  eventBus: ServerEventBus;
  /**
   * The message websocket server API.
   */
  message: ws.Server & {
    /**
     * Broadcast a message to all connected devices.
     */
    broadcast: (method: string, params?: Record<string, any>) => void;
  };
  /**
   * The events websocket server API.
   */
  events: ws.Server & {
    /**
     * Report an event to the reporter.
     */
    reportEvent: (event: { type: string; [key: string]: unknown }) => void;
  };
  /**
   * HMR websocket server API
   */
  hot: ws.Server & {
    send: (client: ws.WebSocket, eventName: string, payload?: unknown) => void;
    sendAll: (eventName: string, payload?: unknown) => void;
  };
}

export type DevServerEvents = {
  'device.connected': { client: WebSocketClient };
  'device.message': { client: WebSocketClient; data: ws.RawData };
  'device.error': { client: WebSocketClient; error: Error };
  'device.disconnected': { client: WebSocketClient };
};

export interface Middlewares {
  /**
   * Register a middleware to the Fastify instance.
   *
   * **NOTE**: This is a wrapper of `instance.use`.
   */
  use: FastifyInstance['use'];
}

export type DevServer = {
  /**
   * The Fastify instance.
   */
  instance: FastifyInstance;
  /**
   * `express` and `connect` style middleware registration API.
   */
  middlewares: Middlewares;
} & DevServerContext &
  Emitter<DevServerEvents>;

export interface BundleDetails {
  bundleType: string;
  dev: boolean;
  entryFile: string;
  minify: boolean;
  platform?: string;
}

export interface FormattedError {
  type: string;
  message: string;
  errors: { description: string }[];
}
