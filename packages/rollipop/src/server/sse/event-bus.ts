import type { ServerResponse } from 'node:http';

import type { SSEEvent } from './types';

export class SSEEventPublisher {
  private clients: Set<ServerResponse> = new Set();

  publish(event: SSEEvent): void {
    const data = JSON.stringify(event);
    const message = `event: ${event.type}\ndata: ${data}\n\n`;
    for (const client of this.clients) {
      if (!client.closed) {
        client.write(message);
      }
    }
  }

  /**
   * Subscribe an SSE HTTP response client.
   */
  addClient(res: ServerResponse): void {
    this.clients.add(res);
  }

  /**
   * Unsubscribe an SSE HTTP response client.
   */
  removeClient(res: ServerResponse): void {
    this.clients.delete(res);
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
