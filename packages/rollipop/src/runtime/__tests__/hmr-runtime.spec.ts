import fs from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import vm from 'node:vm';

import { DevRuntime } from '@rollipop/rolldown/experimental/runtime';
import { transformSync } from '@swc/core';
import * as prettyFormat from 'pretty-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { HMRContext } from '../../types/hmr';
import type { HMRGraphRuntime } from '../../types/runtime';

const clientCode = transformSync(
  fs.readFileSync(new URL('../hmr-client.ts', import.meta.url), 'utf8'),
  {
    filename: 'hmr-client.ts',
    jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  },
).code;

class FakeWebSocket {
  static readonly CONNECTING = 0;
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
      DevRuntime,
      WebSocket: FakeWebSocket,
      __rollipop_runtime__: undefined,
      __turboModuleProxy: undefined,
      nativeModuleProxy: { DevSettings: { reload } },
    });
  });

  afterEach(() => {
    delete (globalThis as any).__rollipop_require__;
    delete (globalThis as any).globalEvalWithSourceUrl;
    delete (globalThis as any).__rollipop_runtime__;
  });

  it('exposes the bundle runtime through import.meta.hot', async () => {
    const { runtime } = await setupRuntime();

    expect((runtime.createModuleHotContext('entry.js') as any).runtime).toBe(runtime);
  });

  describe('initial bundle factories and cache', () => {
    it.each(['esm', 'cjs'])(
      'reuses an initial %s factory after eviction through either executor',
      async (kind) => {
        const { runtime } = await setupRuntime();
        const require = createBundleRequire();
        let executions = 0;
        require.m['parent.js'] = (_global, module, exports) => {
          const value = ++executions;
          if (kind === 'esm') {
            Object.defineProperty(exports, 'value', { get: () => value });
            runtime.registerModule('parent.js', { exports });
          } else {
            runtime.registerModule('parent.js', module);
            module.exports = () => value;
          }
        };
        const readValue = (exports: any) => (kind === 'esm' ? exports.value : exports());

        expect(runtime.hasFactory('parent.js')).toBe(true);
        expect(runtime.isExecuted('parent.js')).toBe(false);
        const first = require('parent.js');
        expect(runtime.initModule('parent.js')).toBe(first);
        expect(runtime.loadExports('parent.js')).toBe(first);
        expect(readValue(first)).toBe(1);

        runtime.removeModuleCache('parent.js');
        expect(require.c['parent.js']).toBeUndefined();
        expect(runtime.isExecuted('parent.js')).toBe(false);
        const second = runtime.initModule('parent.js');
        expect(require('parent.js')).toBe(second);
        expect(readValue(second)).toBe(2);

        runtime.removeModuleCache('parent.js');
        const third = require('parent.js');
        expect(runtime.loadExports('parent.js')).toBe(third);
        expect(readValue(third)).toBe(3);
      },
    );

    it.each(['esm', 'cjs'])(
      'uses the latest %s patch from ordinary require after repeated eviction',
      async (kind) => {
        const { runtime } = await setupRuntime();
        const require = createBundleRequire();
        const original = vi.fn((_global, module: BundleModule) => {
          runtime.registerModule('dep.js', module);
          module.exports = { value: 'initial' };
        });
        require.m['dep.js'] = original;
        expect(require('dep.js')).toEqual({ value: 'initial' });

        for (let version = 1; version <= 2; version++) {
          const factory = vi.fn((id: string) => {
            const holder = { exports: {} as any };
            runtime.registerModule(id, holder);
            if (kind === 'esm') {
              Object.defineProperty(holder.exports, 'value', { get: () => version });
            } else {
              holder.exports = () => version;
            }
          });
          runtime.registerFactory('dep.js', factory, version);
          runtime.removeModuleCache('dep.js');
          const updated = runtime.initModule('dep.js');
          expect(require('dep.js')).toBe(updated);
          expect(kind === 'esm' ? (updated as any).value : (updated as any)()).toBe(version);

          const stale = vi.fn();
          runtime.registerFactory('dep.js', stale, version - 1);
          runtime.removeModuleCache('dep.js');
          const reexecuted = require('dep.js');
          expect(runtime.initModule('dep.js')).toBe(reexecuted);
          expect(runtime.loadExports('dep.js')).toBe(reexecuted);
          expect(kind === 'esm' ? reexecuted.value : reexecuted()).toBe(version);
          expect(factory).toHaveBeenCalledTimes(2);
          expect(stale).not.toHaveBeenCalled();
        }
        expect(original).toHaveBeenCalledOnce();
      },
    );

    it.each([null, undefined, 0, false])(
      'shares CommonJS module.exports reassignment to %s',
      async (value) => {
        const { runtime } = await setupRuntime();
        const require = createBundleRequire();
        const module = { exports: {} as any };
        runtime.registerModule('dep.cjs', module);
        module.exports = value;
        expect(require('dep.cjs')).toBe(value);
        expect(runtime.loadExports('dep.cjs')).toBe(value);
        expect(runtime.initModule('dep.cjs')).toBe(value);
      },
    );

    it('recognizes modules cached only by the bundle and removes both caches before disposal', async () => {
      const { runtime } = await setupRuntime();
      const require = createBundleRequire();
      const exports = { value: 'cached' };
      require.c['helper.js'] = { exports };
      expect(runtime.isExecuted('helper.js')).toBe(true);
      expect(runtime.loadExports('helper.js')).toBe(exports);
      expect(runtime.initModule('helper.js')).toBe(exports);
      const dispose = vi.fn(() => {
        expect(require.c['helper.js']).toBeUndefined();
        expect(runtime.isExecuted('helper.js')).toBe(false);
      });
      runtime.createModuleHotContext('helper.js').dispose(dispose);
      runtime.removeModuleCache('helper.js');
      expect(dispose).toHaveBeenCalledOnce();
    });

    it('shares the bundle holder when a side-effect module registers without exports', async () => {
      const { runtime } = await setupRuntime();
      const require = createBundleRequire();
      require.m['side-effect.js'] = () => runtime.registerModule('side-effect.js');
      const exports = require('side-effect.js');
      expect(require('side-effect.js')).toBe(exports);
      expect(runtime.initModule('side-effect.js')).toBe(exports);
      expect(runtime.loadExports('side-effect.js')).toBe(exports);
    });

    it('reloads when an invalidated non-component module has no accepting ancestor', async () => {
      const { runtime } = await setupRuntime();
      const require = createBundleRequire();
      runtime.registerGraph({ ids: ['route.js', 'entry.js'], localCount: 2, edges: [[], [0]] });
      const entry = vi.fn((_global, module: BundleModule) => {
        runtime.registerModule('entry.js', module);
        runtime.registerModule('route.js', { exports: { Router: {} } });
      });
      require.m['entry.js'] = entry;
      require('entry.js');
      runtime.createModuleHotContext('route.js').invalidate();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
      expect(entry).toHaveBeenCalledOnce();
    });
  });

  describe('client logs', () => {
    const formatter = { format: prettyFormat.format, plugins: prettyFormat.plugins };

    it.each([
      ['named-only', { __esModule: true, ...formatter }],
      ['default-only', { __esModule: true, default: formatter }],
      ['CommonJS', formatter],
      [
        'named and callable default',
        { __esModule: true, ...formatter, default: prettyFormat.format },
      ],
    ])('sends formatted values with %s pretty-format exports', async (_, module) => {
      await createRuntime();
      const client = createClient(module);
      client.setup('ios', 'index.bundle', 'localhost', 8081, true);
      const socket = FakeWebSocket.instances[0];
      const circular: { self?: unknown } = {};
      circular.self = circular;
      const element = {
        $$typeof: Symbol.for('react.element'),
        type: 'View',
        key: null,
        props: { testID: 'counter', children: 'hello' },
      };

      client.log('warn', [
        'object: %s',
        { answer: 42 },
        [1, 2],
        true,
        null,
        undefined,
        new Error('boom'),
        circular,
        element,
      ]);

      expect(socket.sent).toHaveLength(1);
      const message = JSON.parse(socket.sent[0]);
      expect(message.type).toBe('hmr:log');
      expect(message.level).toBe('warn');
      expect(message.data.map(stripVTControlCharacters)).toEqual([
        'object: %s',
        '{"answer": 42}',
        '[1, 2]',
        'true',
        'null',
        'undefined',
        '[Error: boom]',
        '{"self": [Circular]}',
        '<View testID="counter">hello</View>',
      ]);
    });

    it('flushes logs from before setup and while connecting in order without replaying them', async () => {
      const runtime = await createRuntime();
      const client = createClient();
      const circular: { self?: unknown } = {};
      circular.self = circular;
      client.log('info', ['before setup', circular]);

      client.setup('ios', 'index.bundle', 'localhost', 8081, true);
      const socket = FakeWebSocket.instances[0];
      socket.readyState = FakeWebSocket.CONNECTING;
      client.log('warn', ['while connecting', { count: 1 }, undefined]);
      expect(socket.sent).toEqual([]);

      socket.readyState = FakeWebSocket.OPEN;
      socket.emit('open', {});
      client.log('error', ['after opening', [1, 2]]);

      const expectedLogs = [
        { type: 'hmr:log', level: 'info', data: ['before setup', '{"self": [Circular]}'] },
        { type: 'hmr:log', level: 'warn', data: ['while connecting', '{"count": 1}', 'undefined'] },
        { type: 'hmr:log', level: 'error', data: ['after opening', '[1, 2]'] },
      ];
      expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
        {
          type: 'hmr:connected',
          clientId: runtime.clientId,
          bundleEntry: 'index.bundle',
          platform: 'ios',
        },
        ...expectedLogs,
      ]);

      socket.emit('open', {});
      expect(
        socket.sent.map((message) => JSON.parse(message)).filter(({ type }) => type === 'hmr:log'),
      ).toEqual(expectedLogs);
    });

    it('keeps only the latest 100 logs while the socket is connecting', async () => {
      const { client, socket } = await setupClient();
      socket.readyState = FakeWebSocket.CONNECTING;

      for (let index = 0; index < 105; index++) {
        client.log('debug', [index]);
      }
      expect(socket.sent).toEqual([]);

      socket.readyState = FakeWebSocket.OPEN;
      socket.emit('open', {});

      expect(socket.sent.slice(1).map((message) => JSON.parse(message))).toEqual(
        Array.from({ length: 100 }, (_, index) => ({
          type: 'hmr:log',
          level: 'debug',
          data: [String(index + 5)],
        })),
      );
    });

    it('waits for the host socket even when a remote socket opens first', async () => {
      const { runtime, client, socket } = await setupClient();
      socket.readyState = FakeWebSocket.CONNECTING;
      client.log('info', ['host log', { count: 1 }]);
      globalThis.__rollipop_runtime__!.registerGraph({
        id: 'remote',
        origin: 'http://localhost:8082',
        bundleEntry: 'remote.bundle',
        platform: 'ios',
        runtime: { ...runtime, setup: vi.fn(), setEnabled: vi.fn() } as unknown as HMRGraphRuntime,
      });
      const remoteSocket = FakeWebSocket.instances[1];
      remoteSocket.emit('open', {});
      client.log('warn', ['host still connecting']);

      expect(socket.sent).toEqual([]);
      expect(remoteSocket.sent.map((message) => JSON.parse(message).type)).toEqual([
        'hmr:connected',
      ]);

      socket.readyState = FakeWebSocket.OPEN;
      socket.emit('open', {});
      expect(socket.sent.slice(1).map((message) => JSON.parse(message))).toEqual([
        { type: 'hmr:log', level: 'info', data: ['host log', '{"count": 1}'] },
        { type: 'hmr:log', level: 'warn', data: ['host still connecting'] },
      ]);
    });
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

  it('updates unexecuted modules without executing them until their first import', async () => {
    // oxlint-disable-next-line no-eval
    const evaluate = vi.fn((source: string) => (0, eval)(source));
    globalThis.globalEvalWithSourceUrl = evaluate;
    const { runtime, socket } = await setupRuntime();
    runtime.registerFactory('dep.js', (id) => {
      runtime.registerModule(id, { exports: { value: 'before' } });
    });

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
    expect(runtime.isExecuted('dep.js')).toBe(false);
    expect(runtime.initModule('dep.js')).toEqual({ value: 'after' });
    expect(runtime.getImporters('dep.js')).toEqual(['entry.js']);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'hmr:payload-delivered', filename: 'hmr_patch_1.js' },
    ]);
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
    runtime.registerFactory('entry.js', (id) => {
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
  const client = createClient();
  client.setup('ios', 'index.bundle', 'localhost', 8081, enabled);
  return { runtime, client, socket: FakeWebSocket.instances[0] };
}

function createClient(prettyFormatExports: unknown = prettyFormat) {
  // HMRClient is injected into React Native, so provide its native imports in a sandbox.
  const nativeModules: Record<string, unknown> = {
    'pretty-format': prettyFormatExports,
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
  return context.exports.default;
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
    __rolldown_runtime__.registerFactory("dep.js", function (id) {
      __rolldown_runtime__.registerModule(id, { exports: { value: "${value}" } });
      ${createHotContext ? '__rolldown_runtime__.createModuleHotContext(id);' : ''}
    });
  })(globalThis.__rollipop_runtime__.graphs.get("host").runtime);`;
}

type BundleModule = { exports: any };
type BundleRequire = {
  (id: string): any;
  m: Record<
    string,
    (global: unknown, module: BundleModule, exports: any, require: BundleRequire) => void
  >;
  c: Record<string, BundleModule>;
};

function createBundleRequire() {
  const require: BundleRequire = Object.assign(
    (id: string) => {
      if (require.c[id] !== undefined) return require.c[id].exports;
      const module = { exports: {} };
      require.c[id] = module;
      require.m[id].call(module.exports, globalThis, module, module.exports, require);
      return module.exports;
    },
    { m: {} as BundleRequire['m'], c: {} as BundleRequire['c'] },
  );
  (globalThis as any).__rollipop_require__ = require;
  return require;
}
