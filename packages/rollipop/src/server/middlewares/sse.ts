import fp from 'fastify-plugin';

import { toSSEClientLogEvent, toSSEEvent } from '../sse/adapter';
import { SSEEventPublisher } from '../sse/event-bus';
import type { DevServerContext } from '../types';

export interface SSEPluginOptions {
  context: DevServerContext;
}

const plugin = fp<SSEPluginOptions>(
  (fastify, options) => {
    const { context } = options;
    const publisher = new SSEEventPublisher();
    const clientLogPublisher = new SSEEventPublisher();

    // Register a listener to the event bus to publish SSE streams
    context.eventBus.subscribe((event) => {
      const sseEvent = toSSEEvent(event);
      if (sseEvent != null) {
        publisher.publish(sseEvent);
      }

      const clientLogEvent = toSSEClientLogEvent(event);
      if (clientLogEvent != null) {
        clientLogPublisher.publish(clientLogEvent);
      }
    });

    const registerStream = (path: string, streamPublisher: SSEEventPublisher) => {
      fastify.get(path, (request, reply) => {
        reply.hijack();

        const res = reply.raw;
        res.writeHead(200, {
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no',
        });

        // Disable Nagle's algorithm to prevent buffering small writes
        request.raw.socket.setNoDelay(true);

        // Send initial comment to flush headers and confirm connection
        res.write(':ok\n\n');

        streamPublisher.addClient(res);
        request.raw.on('close', () => streamPublisher.removeClient(res));
      });
    };

    registerStream('/sse/events', publisher);
    registerStream('/sse/client-logs', clientLogPublisher);
  },
  { name: 'sse' },
);

export { plugin as sse };
