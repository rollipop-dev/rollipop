import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { HMRContext } from '../../types/hmr';
import type { HMRGraphRuntime, ModuleGraphDelta } from '../../types/runtime';

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
  readonly sent: string[] = [];
  readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, ((event: any) => void)[]>();

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

  it('handles import.meta.hot.invalidate with the resident client graph', async () => {
    const { runtime, socket } = await setupRuntime();
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

    await vi.waitFor(() => expect(accept).toHaveBeenCalledWith({ value: 'after' }));
    expect(socket.sent).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('disposes hot data and removes stale contexts when an update drops import.meta.hot', async () => {
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

async function setupRuntime() {
  const { default: runtime } = await import('../hmr-runtime');
  const typedRuntime = runtime as unknown as HMRGraphRuntime;
  const socket = new FakeWebSocket();
  typedRuntime.setup(socket as unknown as WebSocket, 'http://localhost:8081');
  globalThis.__rollipop_runtime__!.registerGraph({
    id: 'host',
    origin: 'http://localhost:8081',
    bundleEntry: 'index.bundle',
    platform: 'ios',
    runtime: typedRuntime,
  });
  return { runtime: typedRuntime, socket };
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
