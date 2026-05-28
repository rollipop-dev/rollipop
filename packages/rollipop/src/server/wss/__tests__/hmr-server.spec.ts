// oxlint-disable typescript-eslint(unbound-method)
import EventEmitter from 'node:events';

import type { Mock } from 'vite-plus/test';
import { beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

import type { BundlerDevEngine, BundlerPool } from '../../bundler-pool';
import { ServerEventBus } from '../../events/event-bus';
import { HMRServer } from '../hmr-server';
import type { WebSocketClient } from '../server';

vitest.mock('../server', async () => {
  const { default: NodeEventEmitter } = await import('node:events');

  class MockWebSocketServer extends NodeEventEmitter {
    protected clientId = 0;
    protected wss = new NodeEventEmitter();
    protected logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    constructor() {
      super();
    }

    send = vi.fn();
    sendAll = vi.fn();

    protected rawDataToString(data: unknown) {
      return typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
    }
  }

  return {
    WebSocketServer: MockWebSocketServer,
    getWebSocketUpgradeHandler: vi.fn(),
  };
});

/**
 * Exposes private/protected members of `HMRServer` for test assertions.
 * The mock replaces `WebSocketServer` with a plain `EventEmitter`, so
 * `send` is a `vi.fn()` and the internal maps are directly accessible.
 */
interface TestableHMRServer {
  onMessage(client: WebSocketClient, data: Buffer): void;
  sendUpdateToClient(client: WebSocketClient, update: { type: string; code?: string }): void;
  sendReloadToClient(client: WebSocketClient): void;
  cleanup(client: WebSocketClient): void;
  send: Mock;
  wss: EventEmitter;
  instances: Map<number, BundlerDevEngine>;
  bindings: Map<number, unknown>;
}

function asTestable(server: HMRServer): TestableHMRServer {
  return server as unknown as TestableHMRServer;
}

function createMockClient(id: number): WebSocketClient {
  return { id, readyState: 1 } as WebSocketClient;
}

function createMockDevEngine(): BundlerDevEngine {
  return {
    id: 'test-engine',
    ensureInitialized: Promise.resolve(),
    devEngine: {
      registerModules: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn().mockResolvedValue([]),
      removeClient: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as BundlerDevEngine;
}

function createMockBundlerPool(devEngine: BundlerDevEngine): BundlerPool {
  return { get: vi.fn().mockReturnValue(devEngine) } as unknown as BundlerPool;
}

function getSentMessages(testable: TestableHMRServer, client: WebSocketClient) {
  return testable.send.mock.calls
    .filter((call: unknown[]) => call[0] === client)
    .map((call: unknown[]) => JSON.parse(call[1] as string) as Record<string, unknown>);
}

describe('HMRServer', () => {
  let server: HMRServer;
  let testable: TestableHMRServer;
  let bundlerPool: BundlerPool;
  let devEngine: BundlerDevEngine;
  let eventBus: ServerEventBus;

  beforeEach(() => {
    devEngine = createMockDevEngine();
    bundlerPool = createMockBundlerPool(devEngine);
    eventBus = new ServerEventBus();
    server = new HMRServer({ bundlerPool, eventBus });
    testable = asTestable(server);
  });

  describe('onMessage', () => {
    it('should handle hmr:connected message', () => {
      const client = createMockClient(1);
      const message = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });

      testable.onMessage(client, Buffer.from(message));

      expect(bundlerPool.get).toHaveBeenCalledWith('index.bundle', {
        platform: 'ios',
        dev: true,
      });
    });

    it('should receive matching bundler events through the server event bus', async () => {
      const client = createMockClient(1);
      const message = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });

      testable.onMessage(client, Buffer.from(message));
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventBus.emit({ type: 'watch_change', bundlerId: 'other-engine', id: '/other.ts' });
      expect(testable.send).not.toHaveBeenCalled();

      eventBus.emit({ type: 'watch_change', bundlerId: 'test-engine', id: '/index.ts' });

      expect(testable.send).toHaveBeenCalledWith(
        client,
        JSON.stringify({ type: 'hmr:update-start' }),
      );
    });

    it('should handle hmr:log message and emit client log event', async () => {
      const client = createMockClient(1);
      const emit = vi.spyOn(eventBus, 'emit');
      const connectedMessage = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });
      const message = JSON.stringify({
        type: 'hmr:log',
        level: 'info',
        data: ['test log'],
      });

      testable.onMessage(client, Buffer.from(connectedMessage));
      await new Promise((resolve) => setTimeout(resolve, 10));
      testable.onMessage(client, Buffer.from(message));

      expect(emit).toHaveBeenCalledWith({
        type: 'client_log',
        bundlerId: 'test-engine',
        level: 'info',
        data: ['test log'],
      });
    });

    it('should send error when message parsing fails', () => {
      const client = createMockClient(1);

      testable.onMessage(client, Buffer.from('invalid json'));

      expect(testable.send).toHaveBeenCalledWith(
        client,
        expect.stringContaining('"type":"InternalError"'),
      );
    });

    it('should emit custom (non-hmr prefixed) messages on wss', () => {
      const client = createMockClient(1);
      const wssEmitSpy = vi.spyOn(testable.wss, 'emit');
      const message = JSON.stringify({
        type: 'custom:event',
        payload: { data: 'test' },
      });

      testable.onMessage(client, Buffer.from(message));

      expect(wssEmitSpy).toHaveBeenCalledWith('custom:event', { data: 'test' });
    });
  });

  describe('sendUpdateToClient', () => {
    it('should send update and update-done messages', () => {
      const client = createMockClient(1);
      const update = { type: 'Patch' as const, code: 'module.exports = {}' };

      testable.sendUpdateToClient(client, update);

      const messages = getSentMessages(testable, client);
      expect(messages).toContainEqual({ type: 'hmr:update', code: 'module.exports = {}' });
      expect(messages.filter((m) => m.type === 'hmr:update-done')).toHaveLength(1);
    });
  });

  describe('sendReloadToClient', () => {
    it('should send reload and update-done messages', () => {
      const client = createMockClient(1);

      testable.sendReloadToClient(client);

      const messages = getSentMessages(testable, client);
      expect(messages).toContainEqual({ type: 'hmr:reload' });
      expect(messages).toContainEqual({ type: 'hmr:update-done' });
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners and clear maps on cleanup', async () => {
      const client = createMockClient(1);

      const message = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });
      testable.onMessage(client, Buffer.from(message));

      // Wait for async handleConnected
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(testable.instances.get(client.id)).toBeDefined();
      expect(testable.bindings.get(client.id)).toBeDefined();

      testable.cleanup(client);

      expect(testable.instances.get(client.id)).toBeUndefined();
      expect(testable.bindings.get(client.id)).toBeUndefined();
    });
  });
});
