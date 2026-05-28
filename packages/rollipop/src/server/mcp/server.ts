import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { resetCache } from '../../utils/reset-cache';
import type { ServerEventBus } from '../events/event-bus';
import { toSSEEvent } from '../sse/adapter';
import type { SSEEvent } from '../sse/types';

export interface McpPluginOptions {
  projectRoot: string;
  eventBus: ServerEventBus;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

function createMcpServer(options: McpPluginOptions): McpServer {
  const { projectRoot, eventBus } = options;
  const server = new McpServer(
    { name: 'rollipop', version: '0.1.0' },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'reset_cache',
    {
      title: 'Reset Cache',
      description:
        'Clear the entire build cache. The bundler will rebuild from scratch on next change.',
    },
    async () => {
      resetCache(projectRoot);
      eventBus.emit({ type: 'cache_reset' });
      return { content: [{ type: 'text' as const, text: 'Cache cleared successfully.' }] };
    },
  );

  server.registerTool(
    'get_build_events',
    {
      title: 'Get Build Events',
      description:
        'Subscribe to bundler events for a duration. Returns all events (build start/done/fail, watch changes, client logs, device connections) collected during the wait period. Bundler-scoped events include bundlerId.',
      inputSchema: {
        duration: z
          .number()
          .min(1000)
          .max(60000)
          .default(10000)
          .describe('How long to listen for events in milliseconds (1000-60000, default 10000)'),
      },
    },
    async ({ duration }) => {
      const events: SSEEvent[] = [];
      const unsubscribe = eventBus.subscribe((event) => {
        const sseEvent = toSSEEvent(event);
        if (sseEvent != null) {
          events.push(sseEvent);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, duration));
      unsubscribe();

      if (events.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No events received during the listening period.' },
          ],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }],
      };
    },
  );

  return server;
}

const sessions = new Map<string, SessionEntry>();

const plugin = fp<McpPluginOptions>(
  (fastify, options) => {
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    });

    fastify.post('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        await transport.handleRequest(request.raw, reply.raw, request.body);
        return reply;
      }

      if (!sessionId && isInitializeRequest(request.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, server });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const server = createMcpServer(options);
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
        return reply;
      }

      return reply.status(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: invalid or missing session' },
        id: null,
      });
    });

    fastify.get('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessions.has(sessionId)) {
        return reply.status(400).send('Missing or invalid session ID');
      }
      await sessions.get(sessionId)!.transport.handleRequest(request.raw, reply.raw);
      return reply;
    });

    fastify.delete('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessions.has(sessionId)) {
        return reply.status(404).send('Session not found');
      }
      await sessions.get(sessionId)!.transport.handleRequest(request.raw, reply.raw);
      return reply;
    });
  },
  { name: 'mcp' },
);

export { plugin as mcp };
