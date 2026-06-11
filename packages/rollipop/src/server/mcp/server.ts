import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import fp from 'fastify-plugin';

import type { DevServerContext } from '../types';
import { createMcpToolContext } from './context';
import { registerTools, type McpToolContext } from './tools';

export interface McpPluginOptions {
  context: DevServerContext;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

function createMcpServer(options: McpToolContext): McpServer {
  const server = new McpServer(
    { name: 'rollipop', version: globalThis.__ROLLIPOP_VERSION__ },
    { capabilities: { logging: {} } },
  );

  registerTools(server, options);

  return server;
}

const plugin = fp<McpPluginOptions>(
  (fastify, options) => {
    const { context } = options;

    if (context.options.mcp !== true) {
      fastify.all('/mcp', async (_request, reply) => {
        return reply.status(503).send({
          error: {
            code: 'MCP_DISABLED',
            message: 'MCP server is disabled. Start Rollipop with --mcp to enable it.',
          },
        });
      });
      return;
    }

    const toolContext = createMcpToolContext(context);
    const sessions = new Map<string, SessionEntry>();

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

        const server = createMcpServer(toolContext);
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
