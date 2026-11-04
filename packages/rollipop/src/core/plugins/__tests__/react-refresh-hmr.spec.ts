import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import vm from 'node:vm';

import type { DevOptions } from '@rollipop/rolldown/experimental';
import type * as ReactRefresh from 'react-refresh';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createConfig, fixturePath } from '../../../../e2e/helpers';
import { FileStorage } from '../../../storage/file-storage';
import type { HMRGraphRuntime, RollipopDevRuntime } from '../../../types/runtime';
import { Bundler } from '../../bundler';
import type { DevEngine } from '../../types';

const require = createRequire(import.meta.url);
const reactRefreshSource = fs.readFileSync(
  path.join(
    path.dirname(require.resolve('react-refresh/runtime')),
    'cjs/react-refresh-runtime.development.js',
  ),
  'utf8',
);

class TestSocket {
  static readonly OPEN = 1;
  readonly readyState = TestSocket.OPEN;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();

  constructor(private readonly delivered: (filename: string) => void) {}

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(message: string) {
    this.sent.push(message);
    const data = JSON.parse(message);
    if (data.type === 'hmr:payload-delivered') this.delivered(data.filename);
  }

  receive(message: unknown) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }
}

function renderText(component: unknown) {
  let element: { type: any; props: any } = { type: component, props: {} };
  while (typeof element.type === 'function') element = element.type(element.props);
  return element.props.children;
}

describe.each([
  { format: 'ESM', fixture: 'hmr-refresh', route: 'route.tsx' },
  { format: 'CommonJS', fixture: 'hmr-refresh/commonjs', route: 'route.jsx' },
])('React Refresh with native $format modules', ({ fixture, route }) => {
  let engine: DevEngine | undefined;
  let root: string;

  afterEach(async () => {
    await engine?.close();
    engine = undefined;
    Reflect.set(FileStorage, 'instance', null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function start({ componentBoundary = true } = {}) {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-refresh-hmr-')));
    fs.cpSync(fixturePath(fixture), root, { recursive: true });
    if (!componentBoundary) {
      fs.writeFileSync(
        path.join(root, 'index.js'),
        "import { routes } from './registry'; globalThis.executions.entry++; globalThis.routes = routes;\n",
      );
    }

    const reload = vi.fn();
    const logs: string[] = [];
    const context = vm.createContext({
      console: {
        log: (...args: unknown[]) => logs.push(args.join(' ')),
        warn: (...args: unknown[]) => logs.push(args.join(' ')),
        error: (...args: unknown[]) => logs.push(args.join(' ')),
      },
      process: { env: { DEBUG_ROLLIPOP: '1' } },
      setTimeout,
      clearTimeout,
      WebSocket: TestSocket,
      nativeModuleProxy: { DevSettings: { reload } },
      executions: { route: 0, registry: 0, app: 0, entry: 0 },
    });
    // Component detection compares prototypes, so React Refresh must share the bundle's realm.
    const reactRefresh: typeof ReactRefresh = vm.runInContext(
      `(function () { const exports = {}; ${reactRefreshSource}\nreturn exports; })()`,
      context,
    );
    const performReactRefresh = vi.fn(reactRefresh.performReactRefresh);
    context.__ReactRefresh = { ...reactRefresh, performReactRefresh, performFullRefresh: reload };
    context.globalEvalWithSourceUrl = (code: string) => vm.runInContext(code, context);

    const runtimeModules: Record<string, string> = {
      'react-native': "export const Text = 'Text';",
      'react/jsx-dev-runtime': 'export const jsxDEV = (type, props) => ({ type, props });',
    };
    const config = createConfig(fixture, {
      mode: 'development',
      entry: 'index.js',
      plugins: [
        {
          name: 'test:react-runtime',
          resolveId(id) {
            if (Object.hasOwn(runtimeModules, id)) return `\0test:${id}`;
          },
          load(id) {
            if (id.startsWith('\0test:')) return runtimeModules[id.slice('\0test:'.length)];
          },
        },
      ],
    });
    config.root = root;
    config.entry = path.join(root, 'index.js');
    config.envDir = root;
    config.dev.hmr = true;
    config.dev.watch = {
      ...config.dev.watch,
      usePolling: true,
      pollInterval: 50,
      useDebounce: true,
      debounceDuration: 50,
      skipWrite: true,
    };

    const onOutput = vi.fn<NonNullable<DevOptions['onOutput']>>();
    const onHmrUpdates = vi.fn<NonNullable<DevOptions['onHmrUpdates']>>();
    engine = await Bundler.devEngine(
      config,
      { platform: 'android', cache: false },
      {
        host: 'localhost',
        port: 8081,
        bundleEntry: 'index.bundle',
        rebuildStrategy: 'never',
        onOutput,
        onHmrUpdates,
      },
    );
    await engine.run();
    const initial = onOutput.mock.calls.at(-1)![0];
    if (initial instanceof Error) throw initial;
    for (const output of initial.output) {
      if (output.type === 'chunk') vm.runInContext(output.code, context);
    }

    const rollipopRuntime = context.__rollipop_runtime__ as RollipopDevRuntime;
    const runtime = [...rollipopRuntime.graphs.values()][0].runtime as HMRGraphRuntime;
    const socket = new TestSocket((filename) => void engine!.notifyPayloadDelivered(filename));
    runtime.setup(socket as unknown as WebSocket, 'http://localhost:8081');
    await engine.registerClient(runtime.clientId);
    for (const output of initial.output) {
      if (output.type === 'chunk') await engine.notifyPayloadDelivered(output.fileName);
    }

    const routePath = path.join(root, route);
    const routeSource = fs.readFileSync(routePath, 'utf8');
    let sequence = 0;
    async function edit(text: string) {
      // PollWatcher compares whole-second mtimes.
      await sleep(1100);
      onHmrUpdates.mockClear();
      performReactRefresh.mockClear();
      fs.writeFileSync(routePath, routeSource.replace('Hello, world!', text));
      await expect
        .poll(() => onHmrUpdates.mock.calls.length, { timeout: 10_000 })
        .toBeGreaterThan(0);
      const result = onHmrUpdates.mock.calls.at(-1)![0];
      if (result instanceof Error) throw result;
      const patch = result.updates.find(
        ({ clientId, update }) => clientId === runtime.clientId && update.type === 'Patch',
      )?.update;
      if (patch?.type !== 'Patch') throw new Error('Expected HMR patch');
      expect(patch.code).toContain(text);
      socket.receive({ ...patch, type: 'hmr:update', seq: ++sequence });
      await expect
        .poll(() => reload.mock.calls.length + performReactRefresh.mock.calls.length)
        .toBeGreaterThan(0);
    }

    return { context, runtime, reactRefresh, reload, logs, socket, edit };
  }

  it('re-executes importers and uses the latest patched factory for ordinary require after eviction', async () => {
    const { context, runtime, reactRefresh, reload, logs, socket, edit } = await start();
    const appFamily = reactRefresh.getFamilyByType(context.App)!;
    // Keep the original require closure so a fresh importer cannot hide a stale factory.
    const requireRoute = context.requireRoute;
    expect(renderText(appFamily.current)).toBe('Hello, world!');
    expect(context.executions).toEqual({ route: 1, registry: 1, app: 1, entry: 1 });

    let edits = 0;
    for (const text of ['First edit', 'Second edit']) {
      await edit(text);
      edits++;
      expect(reload, logs.join('\n')).not.toHaveBeenCalled();
      expect(renderText(appFamily.current)).toBe(text);
      expect(context.executions).toEqual({
        route: edits * 2,
        registry: edits + 1,
        app: edits + 1,
        entry: 1,
      });

      runtime.removeModuleCache(route);
      expect(runtime.isExecuted(route)).toBe(false);
      expect(renderText(requireRoute().Router.component)).toBe(text);
      expect(runtime.isExecuted(route)).toBe(true);
      expect(context.executions.route).toBe(edits * 2 + 1);
      expect(renderText(requireRoute().Router.component)).toBe(text);
      expect(context.executions.route).toBe(edits * 2 + 1);
    }
    expect(socket.sent.map((message) => JSON.parse(message).type)).toEqual([
      'hmr:payload-delivered',
      'hmr:payload-delivered',
    ]);
  });

  it('still reloads when propagation reaches an entry without a component boundary', async () => {
    const { reload, logs, edit } = await start({ componentBoundary: false });
    await edit('No boundary');
    expect(reload).toHaveBeenCalledOnce();
    expect(logs.join('\n')).toMatch(/No HMR boundary found|No importers to handle invalidate/);
    expect(logs.join('\n')).not.toContain('No factory registered');
  });
});
