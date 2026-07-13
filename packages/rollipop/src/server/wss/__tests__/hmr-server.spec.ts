/* oxlint-disable typescript/unbound-method */
import EventEmitter from 'node:events';

import type { Mock } from 'vite-plus/test';
import { beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import type { BundlerDevEngine, BundlerPool } from '../../bundler-pool';
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
  sendUpdateToClient(
    client: WebSocketClient,
    update: { type: string; code?: string; filename?: string; sourcemap?: string },
  ): void;
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
    invalidate: vi.fn().mockResolvedValue([]),
    devEngine: {
      registerModules: vi.fn().mockResolvedValue(undefined),
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
  let eventBus: EventBus;

  beforeEach(() => {
    devEngine = createMockDevEngine();
    bundlerPool = createMockBundlerPool(devEngine);
    eventBus = new EventBus();
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

    it('should ignore watch_change events until HMR updates are available', async () => {
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

      expect(testable.send).not.toHaveBeenCalled();
    });

    it('should send update-start when matching HMR updates are available', async () => {
      const client = createMockClient(1);
      const message = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });

      testable.onMessage(client, Buffer.from(message));
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventBus.emit({
        type: 'hmr_updates',
        bundlerId: 'test-engine',
        updates: [{ clientId: '1', update: { type: 'Patch', code: 'module.exports = {}' } }],
        changedFiles: ['/index.ts'],
      } as any);

      const messages = getSentMessages(testable, client);
      expect(messages).toContainEqual({ type: 'hmr:update-start' });
      expect(messages).toContainEqual({ type: 'hmr:update', code: 'module.exports = {}' });
      expect(messages).toContainEqual({ type: 'hmr:update-done' });
    });

    it('should send hmr:error for matching hmr_failed events', async () => {
      const client = createMockClient(1);
      const message = JSON.stringify({
        type: 'hmr:connected',
        platform: 'ios',
        bundleEntry: 'index.bundle',
      });

      testable.onMessage(client, Buffer.from(message));
      await new Promise((resolve) => setTimeout(resolve, 10));

      eventBus.emit({
        type: 'hmr_failed',
        bundlerId: 'test-engine',
        error: new Error('Unexpected token'),
      });

      const messages = getSentMessages(testable, client);
      expect(messages).toContainEqual({
        type: 'hmr:error',
        payload: {
          type: 'BuildError',
          errors: [{ description: 'Unexpected token' }],
          message: 'Unexpected token',
        },
      });
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

    it('should attach the patch filename and inline sourcemap', () => {
      const client = createMockClient(1);
      const sourcemap = '{"version":3,"sources":["App.tsx"],"mappings":"AAAA"}';

      testable.sendUpdateToClient(client, {
        type: 'Patch',
        code: 'module.exports = {}',
        filename: 'patch-1.js',
        sourcemap,
      });

      expect(getSentMessages(testable, client)).toContainEqual({
        type: 'hmr:update',
        code: 'module.exports = {}',
        sourceURL: 'patch-1.js',
        sourceMappingURL: `data:application/json;charset=utf-8;base64,${Buffer.from(sourcemap).toString('base64')}`,
      });
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
