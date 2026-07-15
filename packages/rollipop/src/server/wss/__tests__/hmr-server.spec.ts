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

interface TestableHMRServer {
  onMessage(client: WebSocketClient, data: Buffer): void;
  cleanup(client: WebSocketClient): void;
  send: Mock;
  wss: EventEmitter;
  instances: Map<number, BundlerDevEngine>;
  bindings: Map<number, unknown>;
  runtimeClientIds: Map<number, string>;
  pendingPayloads: Map<number, Set<string>>;
}

function asTestable(server: HMRServer): TestableHMRServer {
  return server as unknown as TestableHMRServer;
}

function createMockClient(id: number): WebSocketClient {
  return { id, readyState: 1 } as WebSocketClient;
}

function createMockDevEngine(ensureInitialized: Promise<unknown> = Promise.resolve()) {
  return {
    id: 'test-engine',
    ensureInitialized,
    devEngine: {
      registerClient: vi.fn().mockResolvedValue(undefined),
      notifyPayloadDelivered: vi.fn().mockResolvedValue(undefined),
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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
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

  async function connect(client: WebSocketClient, runtimeClientId = 'runtime-1') {
    testable.onMessage(
      client,
      Buffer.from(
        JSON.stringify({
          type: 'hmr:connected',
          clientId: runtimeClientId,
          platform: 'ios',
          bundleEntry: 'index.bundle',
        }),
      ),
    );
    await flushPromises();
  }

  it('registers the runtime client after the bundler is initialized', async () => {
    const client = createMockClient(1);

    await connect(client);

    expect(bundlerPool.get).toHaveBeenCalledWith('index.bundle', {
      platform: 'ios',
      dev: true,
    });
    expect(devEngine.devEngine.registerClient).toHaveBeenCalledWith('runtime-1');
    expect(testable.instances.get(client.id)).toBe(devEngine);
    expect(testable.runtimeClientIds.get(client.id)).toBe('runtime-1');
    expect(testable.bindings.get(client.id)).toBeDefined();
  });

  it('associates client logs while the bundler is initializing', async () => {
    const deferred = createDeferred();
    devEngine = createMockDevEngine(deferred.promise);
    server = new HMRServer({ bundlerPool: createMockBundlerPool(devEngine), eventBus });
    testable = asTestable(server);
    const client = createMockClient(1);
    const emit = vi.spyOn(eventBus, 'emit');

    void connect(client);
    testable.onMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'hmr:log', level: 'info', data: ['test log'] })),
    );

    expect(emit).toHaveBeenCalledWith({
      type: 'client_log',
      bundlerId: 'test-engine',
      level: 'info',
      data: ['test log'],
    });

    deferred.resolve();
    await flushPromises();
  });

  it('filters updates by runtime client and sends the complete patch envelope', async () => {
    const client = createMockClient(1);
    await connect(client);
    testable.send.mockClear();

    eventBus.emit({
      type: 'hmr_updates',
      bundlerId: 'test-engine',
      updates: [
        {
          clientId: 'other-runtime',
          update: {
            type: 'Patch',
            code: 'other();',
            filename: 'hmr_patch_0.js',
            changedIds: ['/other.ts'],
            seq: 1,
          },
        },
        {
          clientId: 'runtime-1',
          update: {
            type: 'Patch',
            code: 'applyPatch();',
            filename: 'hmr_patch_1.js',
            changedIds: ['/App.tsx'],
            seq: 2,
          },
        },
      ],
      changedFiles: ['/App.tsx'],
    } as any);

    expect(getSentMessages(testable, client)).toEqual([
      { type: 'hmr:update-start' },
      {
        type: 'hmr:update',
        code: 'applyPatch();',
        filename: 'hmr_patch_1.js',
        sourceURL: '/hot/test-engine/hmr_patch_1.js',
        changedIds: ['/App.tsx'],
        seq: 2,
      },
      { type: 'hmr:update-done' },
    ]);
    expect(testable.pendingPayloads.get(client.id)).toEqual(new Set(['hmr_patch_1.js']));
  });

  it('does not send messages for Noop or another runtime client', async () => {
    const client = createMockClient(1);
    await connect(client);
    testable.send.mockClear();

    eventBus.emit({
      type: 'hmr_updates',
      bundlerId: 'test-engine',
      updates: [
        { clientId: 'runtime-1', update: { type: 'Noop' } },
        { clientId: 'other-runtime', update: { type: 'FullReload' } },
      ],
      changedFiles: ['/App.tsx'],
    } as any);

    expect(testable.send).not.toHaveBeenCalled();
  });

  it('sends a full reload as one update batch', async () => {
    const client = createMockClient(1);
    await connect(client);
    testable.send.mockClear();

    eventBus.emit({
      type: 'hmr_updates',
      bundlerId: 'test-engine',
      updates: [{ clientId: 'runtime-1', update: { type: 'FullReload', reason: 'no boundary' } }],
      changedFiles: ['/App.tsx'],
    } as any);

    expect(getSentMessages(testable, client)).toEqual([
      { type: 'hmr:update-start' },
      { type: 'hmr:reload' },
      { type: 'hmr:update-done' },
    ]);
  });

  it('notifies payload delivery exactly once for a pending filename', async () => {
    const client = createMockClient(1);
    await connect(client);

    eventBus.emit({
      type: 'hmr_updates',
      bundlerId: 'test-engine',
      updates: [
        {
          clientId: 'runtime-1',
          update: {
            type: 'Patch',
            code: 'applyPatch();',
            filename: 'hmr_patch_1.js',
            changedIds: ['/App.tsx'],
            seq: 1,
          },
        },
      ],
      changedFiles: ['/App.tsx'],
    } as any);

    for (const filename of ['unknown.js', 'hmr_patch_1.js', 'hmr_patch_1.js']) {
      testable.onMessage(
        client,
        Buffer.from(JSON.stringify({ type: 'hmr:payload-delivered', filename })),
      );
    }
    await flushPromises();

    expect(devEngine.devEngine.notifyPayloadDelivered).toHaveBeenCalledTimes(1);
    expect(devEngine.devEngine.notifyPayloadDelivered).toHaveBeenCalledWith('hmr_patch_1.js');
    expect(testable.pendingPayloads.get(client.id)).toEqual(new Set());
  });

  it('bounds pending payload validation state per client', async () => {
    const client = createMockClient(1);
    await connect(client);

    for (let index = 1; index <= 9; index++) {
      eventBus.emit({
        type: 'hmr_updates',
        bundlerId: 'test-engine',
        updates: [
          {
            clientId: 'runtime-1',
            update: {
              type: 'Patch',
              code: 'applyPatch();',
              filename: `hmr_patch_${index}.js`,
              changedIds: ['/App.tsx'],
              seq: index,
            },
          },
        ],
        changedFiles: ['/App.tsx'],
      } as any);
    }

    expect(testable.pendingPayloads.get(client.id)).toEqual(
      new Set(Array.from({ length: 8 }, (_, index) => `hmr_patch_${index + 2}.js`)),
    );

    for (const filename of ['hmr_patch_1.js', 'hmr_patch_9.js']) {
      testable.onMessage(
        client,
        Buffer.from(JSON.stringify({ type: 'hmr:payload-delivered', filename })),
      );
    }
    await flushPromises();

    expect(devEngine.devEngine.notifyPayloadDelivered).toHaveBeenCalledOnce();
    expect(devEngine.devEngine.notifyPayloadDelivered).toHaveBeenCalledWith('hmr_patch_9.js');
  });

  it('sends hmr:error for matching hmr_failed events', async () => {
    const client = createMockClient(1);
    await connect(client);
    testable.send.mockClear();

    eventBus.emit({
      type: 'hmr_failed',
      bundlerId: 'test-engine',
      error: new Error('Unexpected token'),
    });

    expect(getSentMessages(testable, client)).toEqual([
      {
        type: 'hmr:error',
        payload: {
          type: 'BuildError',
          errors: [{ description: 'Unexpected token' }],
          message: 'Unexpected token',
        },
      },
    ]);
  });

  it('emits client logs with the bundler id', async () => {
    const client = createMockClient(1);
    const emit = vi.spyOn(eventBus, 'emit');
    await connect(client);

    testable.onMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'hmr:log', level: 'info', data: ['test log'] })),
    );

    expect(emit).toHaveBeenCalledWith({
      type: 'client_log',
      bundlerId: 'test-engine',
      level: 'info',
      data: ['test log'],
    });
  });

  it('sends an error when message parsing fails', () => {
    const client = createMockClient(1);

    testable.onMessage(client, Buffer.from('invalid json'));

    expect(testable.send).toHaveBeenCalledWith(
      client,
      expect.stringContaining('"type":"InternalError"'),
    );
  });

  it('emits custom messages on the websocket server', () => {
    const client = createMockClient(1);
    const wssEmitSpy = vi.spyOn(testable.wss, 'emit');

    testable.onMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'custom:event', payload: { data: 'test' } })),
    );

    expect(wssEmitSpy).toHaveBeenCalledWith('custom:event', { data: 'test' });
  });

  it('removes the runtime client and clears state on cleanup', async () => {
    const client = createMockClient(1);
    await connect(client);

    testable.cleanup(client);
    await flushPromises();

    expect(devEngine.devEngine.removeClient).toHaveBeenCalledWith('runtime-1');
    expect(testable.instances.get(client.id)).toBeUndefined();
    expect(testable.bindings.get(client.id)).toBeUndefined();
    expect(testable.runtimeClientIds.get(client.id)).toBeUndefined();
    expect(testable.pendingPayloads.get(client.id)).toBeUndefined();
  });

  it('removes a runtime client that closes while registration is pending', async () => {
    const client = createMockClient(1);
    const registerClient = createDeferred();
    vi.mocked(devEngine.devEngine.registerClient).mockReturnValueOnce(registerClient.promise);

    const connecting = connect(client);
    await flushPromises();
    expect(devEngine.devEngine.registerClient).toHaveBeenCalledWith('runtime-1');

    testable.cleanup(client);
    registerClient.resolve();
    await connecting;
    await flushPromises();

    expect(devEngine.devEngine.removeClient).toHaveBeenCalledWith('runtime-1');
    expect(testable.instances.get(client.id)).toBeUndefined();
    expect(testable.bindings.get(client.id)).toBeUndefined();
  });
});
