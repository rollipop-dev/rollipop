import fs from 'node:fs';
import vm from 'node:vm';

import { transformSync } from '@swc/core';
import prettyFormat from 'pretty-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { HMRContext } from '../../types/hmr';
import type { HMRGraphRuntime, ModuleGraphDelta } from '../../types/runtime';

const clientCode = transformSync(
  fs.readFileSync(new URL('../hmr-client.ts', import.meta.url), 'utf8'),
  {
    filename: 'hmr-client.ts',
    jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  },
).code;

class FakeDevRuntime {
  clientId: string;
  hooks: {
    createModuleHotContext(moduleId: string): unknown;
    onModuleCacheRemoval(moduleId: string): void;
  } | null = null;
  private readonly factories = new Map<string, (id: string) => void>();
  private readonly importers = new Map<string, Set<string>>();
  private readonly modules = new Map<string, { exports: any }>();

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  registerGraph(delta: ModuleGraphDelta) {
    for (let index = 0; index < delta.localCount; index++) {
      const importer = delta.ids[index];
      for (const targetIndex of delta.edges[index]) {
        const target = delta.ids[targetIndex];
        const importers = this.importers.get(target) ?? new Set();
        importers.add(importer);
        this.importers.set(target, importers);
      }
    }
  }

  registerFactory(id: string, _kind: 'esm' | 'cjs', factory: (id: string) => void) {
    this.factories.set(id, factory);
  }

  registerModule(id: string, exportsHolder: { exports: any }) {
    this.modules.set(id, exportsHolder);
  }

  getImporters(id: string) {
    return [...(this.importers.get(id) ?? [])];
  }

  isExecuted(id: string) {
    return this.modules.has(id);
  }

  hasFactory(id: string) {
    return this.factories.has(id);
  }

  removeModuleCache(id: string) {
    this.modules.delete(id);
    this.hooks?.onModuleCacheRemoval(id);
  }

  initModule(id: string) {
    if (!this.modules.has(id)) {
      this.factories.get(id)?.(id);
    }
    return this.loadExports(id);
  }

  loadExports(id: string) {
    return this.modules.get(id)?.exports ?? {};
  }

  createModuleHotContext(moduleId: string) {
    return this.hooks?.createModuleHotContext(moduleId);
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, ((event: any) => void)[]>();

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {}

  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const reload = vi.fn();

describe('HMR runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    reload.mockReset();
    FakeWebSocket.instances = [];
    Object.assign(globalThis, {
      DevRuntime: FakeDevRuntime,
      WebSocket: FakeWebSocket,
      __rollipop_runtime__: undefined,
      __turboModuleProxy: undefined,
      nativeModuleProxy: { DevSettings: { reload } },
    });
  });

  afterEach(() => {
    delete (globalThis as any).globalEvalWithSourceUrl;
    delete (globalThis as any).__rollipop_runtime__;
  });

  it('exposes the bundle runtime through import.meta.hot', async () => {
    const { runtime } = await setupRuntime();

    expect((runtime.createModuleHotContext('entry.js') as any).runtime).toBe(runtime);
  });

  it('evaluates a patch, acknowledges delivery, and applies accepted updates', async () => {
    // oxlint-disable-next-line no-eval
    const evaluate = vi.fn((source: string) => (0, eval)(source));
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { runtime, socket } = await setupRuntime();
    const accept = vi.fn();

    runtime.registerGraph({
      ids: ['dep.js', 'entry.js'],
      localCount: 2,
      edges: [[], [0]],
    });
    runtime.registerModule('dep.js', { exports: { value: 'before' } });
    runtime.registerModule('entry.js', { exports: {} });
    runtime.createModuleHotContext('dep.js');
    runtime.createModuleHotContext('entry.js').accept('dep.js', accept);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hmr:update',
        code: createPatch('after') + '\n//# sourceMappingURL=hmr_patch_1.js.map',
        filename: 'hmr_patch_1.js',
        sourceURL: '/hot/host/hmr_patch_1.js',
        changedIds: ['dep.js'],
        seq: 1,
      }),
    });

    await vi.waitFor(() => expect(accept).toHaveBeenCalledWith({ value: 'after' }));
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'hmr:payload-delivered',
      filename: 'hmr_patch_1.js',
    });
    expect(evaluate).toHaveBeenCalledWith(
      expect.stringContaining('//# sourceMappingURL=hmr_patch_1.js.map'),
      'http://localhost:8081/hot/host/hmr_patch_1.js',
    );
    expect(evaluate.mock.calls[0][0]).toContain(
      '//# sourceURL=http://localhost:8081/hot/host/hmr_patch_1.js',
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads without evaluating or acknowledging a sequence gap', async () => {
    const evaluate = vi.fn();
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { socket } = await setupRuntime();

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hmr:update',
        code: createPatch('after'),
        filename: 'hmr_patch_2.js',
        sourceURL: '/hot/host/hmr_patch_2.js',
        changedIds: ['dep.js'],
        seq: 2,
      }),
    });

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(evaluate).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
  });

  it.each([3, 12])(
    'defers disabled client updates and resumes %i patches in order',
    async (count) => {
      // oxlint-disable-next-line no-eval
      const evaluate = vi.fn((source: string) => (0, eval)(source));
      globalThis.globalEvalWithSourceUrl = evaluate;
      const { runtime, socket, client } = await setupClient(false);
      const accept = vi.fn();
      const onCustomMessage = vi.fn();
      const customHandler = vi.fn();
      globalThis.__rollipop_runtime__!.customHMRHandler = customHandler;

      runtime.registerGraph({ ids: ['dep.js', 'entry.js'], localCount: 2, edges: [[], [0]] });
      runtime.registerModule('dep.js', { exports: { value: 'before' } });
      runtime.registerModule('entry.js', { exports: {} });
      const hot = runtime.createModuleHotContext('entry.js');
      hot.accept('dep.js', accept);
      hot.on('custom:event', onCustomMessage);

      for (let seq = 1; seq < count; seq++) {
        emitPatch(socket, seq);
      }
      socket.emit('message', {
        data: JSON.stringify({ type: 'custom:event', payload: { value: 'custom' } }),
      });
      client.log('info', ['still connected']);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(evaluate).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(onCustomMessage).toHaveBeenCalledWith({ value: 'custom' });
      expect(customHandler).toHaveBeenCalledWith(socket, {
        type: 'custom:event',
        payload: { value: 'custom' },
      });
      expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
        { type: 'hmr:log', level: 'info', data: ['still connected'] },
      ]);

      client.enable();
      emitPatch(socket, count);

      await vi.waitFor(() => expect(accept).toHaveBeenCalledTimes(count));
      expect(accept.mock.calls).toEqual(
        Array.from({ length: count }, (_, index) => [{ value: String(index + 1) }]),
      );
      expect(socket.sent.slice(1).map((message) => JSON.parse(message))).toEqual(
        Array.from({ length: count }, (_, index) => ({
          type: 'hmr:payload-delivered',
          filename: `hmr_patch_${index + 1}.js`,
        })),
      );
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it('stops draining pending updates when the client is disabled during an accept callback', async () => {
    // oxlint-disable-next-line no-eval
    const evaluate = vi.fn((source: string) => (0, eval)(source));
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { runtime, socket, client } = await setupClient(false);
    const accept = vi.fn().mockImplementationOnce(() => client.disable());
    runtime.registerGraph({ ids: ['dep.js', 'entry.js'], localCount: 2, edges: [[], [0]] });
    runtime.registerModule('dep.js', { exports: {} });
    runtime.registerModule('entry.js', { exports: {} });
    runtime.createModuleHotContext('entry.js').accept('dep.js', accept);

    emitPatch(socket, 1);
    emitPatch(socket, 2);
    client.enable();

    await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce());
    expect(evaluate).toHaveBeenCalledOnce();
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'hmr:payload-delivered', filename: 'hmr_patch_1.js' },
    ]);

    client.enable();
    await vi.waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
    expect(accept).toHaveBeenLastCalledWith({ value: '2' });
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('pauses already queued updates and full reloads through repeated client toggles', async () => {
    // oxlint-disable-next-line no-eval
    const evaluate = vi.fn((source: string) => (0, eval)(source));
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { runtime, socket, client } = await setupClient();
    runtime.registerModule('dep.js', { exports: {} });
    runtime.createModuleHotContext('dep.js').accept();

    emitPatch(socket, 1);
    client.disable();
    client.disable();
    socket.emit('message', { data: JSON.stringify({ type: 'hmr:reload' }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(evaluate).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
    expect(reload).not.toHaveBeenCalled();

    client.enable();
    client.disable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(evaluate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    client.enable();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'hmr:payload-delivered', filename: 'hmr_patch_1.js' },
    ]);
  });

  it.each(['reload', 'sequence gap', 'evaluation error'])(
    'stops a resumed backlog after a %s requests a native reload',
    async (reason) => {
      const evaluate = vi.fn(() => {
        if (reason === 'evaluation error') {
          throw new Error('Invalid patch');
        }
      });
      globalThis.globalEvalWithSourceUrl = evaluate;
      const { runtime, socket, client } = await setupClient(false);
      runtime.registerModule('dep.js', { exports: {} });
      runtime.createModuleHotContext('dep.js').accept();

      if (reason === 'reload') {
        socket.emit('message', { data: JSON.stringify({ type: 'hmr:reload' }) });
      } else {
        emitPatch(socket, reason === 'sequence gap' ? 2 : 1);
      }
      emitPatch(socket, reason === 'evaluation error' ? 2 : 1);
      socket.emit('message', { data: JSON.stringify({ type: 'hmr:reload' }) });
      client.enable();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reload).toHaveBeenCalledOnce();
      expect(evaluate).toHaveBeenCalledTimes(reason === 'evaluation error' ? 1 : 0);
      expect(socket.sent).toEqual([]);
    },
  );

  it('applies the disabled state to graphs registered after client setup', async () => {
    const { runtime, client } = await setupClient(false);
    const setup = vi.fn();
    const setEnabled = vi.fn();
    const remoteRuntime = {
      ...runtime,
      setup,
      setEnabled,
    } as unknown as HMRGraphRuntime;

    globalThis.__rollipop_runtime__!.registerGraph({
      id: 'remote',
      origin: 'http://localhost:8082',
      bundleEntry: 'remote.bundle',
      platform: 'ios',
      runtime: remoteRuntime,
    });

    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
    expect(setup).toHaveBeenCalledWith(FakeWebSocket.instances[1], 'http://localhost:8082');
    client.enable();
    expect(setEnabled).toHaveBeenLastCalledWith(true);
    client.disable();
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not evaluate or acknowledge changes for modules that were not executed', async () => {
    const evaluate = vi.fn();
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { socket } = await setupRuntime();

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hmr:update',
        code: createPatch('after'),
        filename: 'hmr_patch_1.js',
        sourceURL: '/hot/host/hmr_patch_1.js',
        changedIds: ['dep.js'],
        seq: 1,
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(evaluate).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([true, false])('handles import.meta.hot.invalidate with enabled=%s', async (enabled) => {
    const { runtime, socket } = await setupRuntime();
    runtime.setEnabled(enabled);
    const accept = vi.fn();

    runtime.registerGraph({
      ids: ['dep.js', 'entry.js'],
      localCount: 2,
      edges: [[], [0]],
    });
    runtime.registerModule('dep.js', { exports: {} });
    runtime.registerModule('entry.js', { exports: { value: 'before' } });
    runtime.registerFactory('entry.js', 'esm', (id) => {
      runtime.registerModule(id, { exports: { value: 'after' } });
      runtime.createModuleHotContext(id).accept();
    });
    const invalidator = runtime.createModuleHotContext('dep.js');
    runtime.createModuleHotContext('entry.js').accept(accept);

    invalidator.invalidate();

    if (!enabled) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(accept).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      runtime.setEnabled(true);
    }

    await vi.waitFor(() => expect(accept).toHaveBeenCalledWith({ value: 'after' }));
    expect(socket.sent).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('disposes hot data and removes stale contexts when an update drops import.meta.hot', async () => {
    // oxlint-disable-next-line no-eval
    const evaluate = vi.fn((source: string) => (0, eval)(source));
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { runtime, socket } = await setupRuntime();
    const accept = vi.fn();
    let previousCount = 0;
    const dispose = vi.fn((data: { count: number }) => {
      data.count = previousCount + 1;
    });

    runtime.registerGraph({ ids: ['dep.js'], localCount: 1, edges: [[]] });
    runtime.registerModule('dep.js', { exports: { value: 'before' } });
    const hot = runtime.createModuleHotContext('dep.js') as HMRContext;
    hot.data.count = 1;
    previousCount = hot.data.count;
    hot.dispose(dispose);
    hot.accept(accept);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hmr:update',
        code: createPatch('after', false),
        filename: 'hmr_patch_1.js',
        sourceURL: '/hot/host/hmr_patch_1.js',
        changedIds: ['dep.js'],
        seq: 1,
      }),
    });

    await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce());
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose.mock.calls[0][0]).toEqual({ count: 2 });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hmr:update',
        code: createPatch('again', false),
        filename: 'hmr_patch_2.js',
        sourceURL: '/hot/host/hmr_patch_2.js',
        changedIds: ['dep.js'],
        seq: 2,
      }),
    });

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(accept).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledOnce();
  });
});

async function createRuntime() {
  const { default: runtime } = await import('../hmr-runtime');
  const typedRuntime = runtime as unknown as HMRGraphRuntime;
  globalThis.__rollipop_runtime__!.registerGraph({
    id: 'host',
    origin: 'http://localhost:8081',
    bundleEntry: 'index.bundle',
    platform: 'ios',
    runtime: typedRuntime,
  });
  return typedRuntime;
}

async function setupRuntime() {
  const runtime = await createRuntime();
  const socket = new FakeWebSocket();
  runtime.setup(socket as unknown as WebSocket, 'http://localhost:8081');
  return { runtime, socket };
}

async function setupClient(enabled = true) {
  const runtime = await createRuntime();
  // HMRClient is injected into React Native, so provide its native imports in a sandbox.
  const nativeModules: Record<string, unknown> = {
    'pretty-format': prettyFormat,
    '../LogBox/LogBox': { clearAllLogs: vi.fn() },
    '../NativeModules/specs/NativeRedBox': { dismiss: vi.fn() },
    './DevLoadingView': { hide: vi.fn(), showMessage: vi.fn() },
    './Platform': { OS: 'ios' },
  };
  const context = {
    exports: {} as { default: typeof import('../hmr-client').default },
    globalThis,
    WebSocket: FakeWebSocket,
    __DEV__: true,
    console,
    require(id: string) {
      if (!(id in nativeModules)) {
        throw new Error(`Unexpected native import: ${id}`);
      }
      return nativeModules[id];
    },
  };
  vm.runInNewContext(clientCode, context);
  const client = context.exports.default;
  client.setup('ios', 'index.bundle', 'localhost', 8081, enabled);
  return { runtime, client, socket: FakeWebSocket.instances[0] };
}

function emitPatch(socket: FakeWebSocket, seq: number) {
  socket.emit('message', {
    data: JSON.stringify({
      type: 'hmr:update',
      code: createPatch(String(seq)),
      filename: `hmr_patch_${seq}.js`,
      sourceURL: `/hot/host/hmr_patch_${seq}.js`,
      changedIds: ['dep.js'],
      seq,
    }),
  });
}

function createPatch(value: string, createHotContext = true) {
  return `(function (__rolldown_runtime__) {
    __rolldown_runtime__.registerGraph({
      ids: ["dep.js", "entry.js"],
      localCount: 2,
      edges: [[], [0]],
      dynamicEdges: [[], []]
    });
    __rolldown_runtime__.registerFactory("dep.js", "esm", function (id) {
      __rolldown_runtime__.registerModule(id, { exports: { value: "${value}" } });
      ${createHotContext ? '__rolldown_runtime__.createModuleHotContext(id);' : ''}
    });
  })(globalThis.__rollipop_runtime__.graphs.get("host").runtime);`;
}
