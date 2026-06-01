// oxlint-disable typescript-eslint(unbound-method)
import { type ServerResponse } from 'node:http';

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { SSEEventPublisher } from '../event-bus';
import type { SSEEvent } from '../types';

function createMockResponse(): ServerResponse & { chunks: string[] } {
  const chunks: string[] = [];
  return {
    closed: false,
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
    chunks,
  } as unknown as ServerResponse & { chunks: string[] };
}

describe('SSEEventPublisher', () => {
  let publisher: SSEEventPublisher;

  beforeEach(() => {
    publisher = new SSEEventPublisher();
  });

  describe('addClient / removeClient', () => {
    it('should track client count', () => {
      const res = createMockResponse();

      expect(publisher.clientCount).toBe(0);
      publisher.addClient(res);
      expect(publisher.clientCount).toBe(1);
      publisher.removeClient(res);
      expect(publisher.clientCount).toBe(0);
    });
  });

  describe('publish', () => {
    it('should send SSE-formatted message to all subscribed clients', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      publisher.addClient(res1);
      publisher.addClient(res2);

      const event: SSEEvent = { type: 'server_ready', host: 'localhost', port: 8081 };
      publisher.publish(event);

      const expected = `event: server_ready\ndata: ${JSON.stringify(event)}\n\n`;
      expect(res1.write).toHaveBeenCalledWith(expected);
      expect(res2.write).toHaveBeenCalledWith(expected);
    });

    it('should not send to removed clients', () => {
      const res = createMockResponse();
      publisher.addClient(res);
      publisher.removeClient(res);

      publisher.publish({ type: 'bundle_build_started', bundlerId: 'ios-true' });

      expect(res.write).not.toHaveBeenCalled();
    });

    it('should skip closed connections', () => {
      const res = createMockResponse();
      publisher.addClient(res);
      (res as unknown as { closed: boolean }).closed = true;

      publisher.publish({ type: 'bundle_build_started', bundlerId: 'ios-true' });

      expect(res.write).not.toHaveBeenCalled();
    });

    it('should format different event types correctly', () => {
      const res = createMockResponse();
      publisher.addClient(res);

      publisher.publish({
        type: 'bundle_build_done',
        bundlerId: 'ios-true',
        totalModules: 42,
        transformedModules: 30,
        cacheHitModules: 12,
        duration: 1500,
      });
      publisher.publish({ type: 'watch_change', bundlerId: 'ios-true', file: 'src/App.tsx' });

      expect(res.chunks).toHaveLength(2);
      expect(res.chunks[0]).toContain('event: bundle_build_done');
      expect(res.chunks[0]).toContain('"totalModules":42');
      expect(res.chunks[0]).toContain('"cacheHitModules":12');
      expect(res.chunks[1]).toContain('event: watch_change');
      expect(res.chunks[1]).toContain('"file":"src/App.tsx"');
    });
  });
});
