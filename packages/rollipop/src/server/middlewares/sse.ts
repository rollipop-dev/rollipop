import fp from 'fastify-plugin';

import type { SSEEventPublisher } from '../sse/event-bus';

export interface SSEPluginOptions {
  publisher: SSEEventPublisher;
}

const plugin = fp<SSEPluginOptions>(
  (fastify, { publisher }) => {
    fastify.get('/sse/events', (request, reply) => {
      const res = reply.raw;
      res.writeHead(200, {
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });

      // Disable Nagle's algorithm to prevent buffering small writes
      request.raw.socket.setNoDelay(true);

      // Send initial comment to flush headers and confirm connection
      res.write(':ok\n\n');

      publisher.addClient(res);
      request.raw.on('close', () => publisher.removeClient(res));
    });
  },
  { name: 'sse' },
);

export { plugin as sse };
