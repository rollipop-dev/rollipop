import mitt from 'mitt';

import type {
  HMRClientMessage,
  HMRCustomMessage,
  HMRServerMessage,
  HMRContext,
} from '../types/hmr';
import type {
  DevRuntime as DefaultDevRuntime,
  HMRGraph,
  HMRGraphRuntime,
  RollipopDevRuntime,
} from '../types/runtime';
import { lazyReactRefresh } from './react-refresh-utils';

declare global {
  var globalEvalWithSourceUrl: ((code: string, sourceURL?: string) => void) | undefined;
  var __rollipop_runtime__: RollipopDevRuntime | undefined;
  // React native specific globals.
  var __turboModuleProxy: (moduleName: string) => any;
  var nativeModuleProxy: Record<string, any>;
}

// DO NOT EDIT THIS CLASS NAME (`DevRuntime`)
declare const DevRuntime: typeof DefaultDevRuntime;

var BaseDevRuntime = DevRuntime;

interface AcceptCallback {
  deps: string[];
  fn: (moduleExports: any[]) => void;
}

type HMRUpdate =
  | { type: 'noop' }
  | { type: 'full-reload'; reason: string }
  | {
      type: 'boundaries';
      boundaries: [string, string][];
      updateSet: string[];
    };

class ModuleHotContext implements HMRContext {
  private readonly removeListeners: (() => void)[] = [];
  private disposeCallback: ((data: any) => void) | undefined;
  acceptCallbacks: AcceptCallback[] = [];

  constructor(
    private moduleId: string,
    private socketHolder: SocketHolder,
    readonly runtime: HMRGraphRuntime,
    readonly data: any,
    private invalidateModule: (moduleId: string) => void,
  ) {}

  accept(deps?: string | string[] | ((module: any) => void), callback?: (module: any) => void) {
    if (typeof deps === 'function' || deps == null) {
      this.acceptCallbacks.push({
        deps: [this.moduleId],
        fn: ([module]) => deps?.(module),
      });
    } else if (typeof deps === 'string') {
      this.acceptCallbacks.push({
        deps: [deps],
        fn: ([module]) => callback?.(module),
      });
    } else if (Array.isArray(deps)) {
      this.acceptCallbacks.push({
        deps,
        fn: callback ?? (() => {}),
      });
    } else {
      throw new Error('Invalid arguments for `import.meta.hot.accept`');
    }
  }

  invalidate() {
    this.invalidateModule(this.moduleId);
  }

  dispose(callback: (data: any) => void) {
    this.disposeCallback = callback;
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.socketHolder.on(event, listener);
    this.removeListeners.push(() => this.socketHolder.off(event, listener));
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.socketHolder.off(event, listener);
  }

  send(type: string, payload?: unknown) {
    this.socketHolder.send(JSON.stringify({ type, payload }));
  }

  cleanup() {
    for (const removeListener of this.removeListeners) {
      removeListener();
    }
    this.removeListeners.length = 0;
  }

  runDispose(data: any) {
    this.disposeCallback?.(data);
  }
}

class SocketHolder {
  private readonly queuedMessages: string[] = [];
  private readonly emitter = mitt();
  private _socket: WebSocket | null = null;
  private _origin: string | null = null;

  get socket() {
    return this._socket;
  }

  get origin() {
    return this._origin;
  }

  setup(socket: WebSocket, origin: string) {
    this._socket = socket;
    this._origin = origin;

    if (socket.readyState !== WebSocket.OPEN) {
      socket.addEventListener('open', () => this.flushQueuedMessages(), { once: true });
    } else {
      this.flushQueuedMessages();
    }
  }

  on(event: string, listener: (payload?: unknown) => void) {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (payload?: unknown) => void) {
    this.emitter.off(event, listener);
  }

  emit(event: string, payload?: unknown) {
    this.emitter.emit(event, payload);
  }

  send(message: string) {
    if (this._socket == null || this._socket.readyState !== WebSocket.OPEN) {
      this.queuedMessages.push(message);
      return;
    }
    this.flushQueuedMessages();
    this._socket.send(message);
  }

  flushQueuedMessages() {
    if (this._socket == null) {
      return;
    }
    for (const message of this.queuedMessages) {
      this._socket.send(message);
    }
    this.queuedMessages.length = 0;
  }

  close() {
    if (this._socket == null) {
      return;
    }
    this._socket.close();
  }
}

class ReactNativeDevRuntime extends BaseDevRuntime {
  private readonly socketHolder: SocketHolder;
  private readonly moduleHotContexts = new Map<string, ModuleHotContext>();
  private readonly moduleHotContextsToBeUpdated = new Map<string, ModuleHotContext | null>();
  private readonly moduleHotData = new Map<string, any>();
  private applyQueue = Promise.resolve();
  private currentFirstInvalidatedBy: string | undefined;
  private lastSeq = 0;

  constructor() {
    const socketHolder = new SocketHolder();
    super(createClientId());
    this.socketHolder = socketHolder;
    this.hooks = {
      createModuleHotContext: (moduleId) => this.createHotContext(moduleId),
      onModuleCacheRemoval: (moduleId) => this.handleModuleCacheRemoval(moduleId),
    };
  }

  private createHotContext(moduleId: string) {
    let data = this.moduleHotData.get(moduleId);
    if (data == null) {
      data = {};
      this.moduleHotData.set(moduleId, data);
    }
    const hotContext = new ModuleHotContext(moduleId, this.socketHolder, this, data, (id) =>
      this.invalidateLocally(id),
    );
    if (this.moduleHotContexts.has(moduleId) || this.moduleHotContextsToBeUpdated.has(moduleId)) {
      this.moduleHotContextsToBeUpdated.set(moduleId, hotContext);
    } else {
      this.moduleHotContexts.set(moduleId, hotContext);
    }
    return hotContext;
  }

  private handleModuleCacheRemoval(moduleId: string) {
    const data = {};
    const hotContext = this.moduleHotContexts.get(moduleId);
    hotContext?.runDispose(data);
    hotContext?.cleanup();
    this.moduleHotData.set(moduleId, data);
    this.moduleHotContextsToBeUpdated.set(moduleId, null);
  }

  setup(socket: WebSocket, origin: string) {
    if (this.socketHolder.socket != null) {
      console.warn('[HMR]: ReactNativeDevRuntime already setup');
      return;
    }

    this.socketHolder.setup(socket, origin);

    socket.addEventListener('message', (event: MessageEvent) => {
      const message = JSON.parse(event.data) as HMRServerMessage;

      if (isCustomHMRMessage(message)) {
        debug(`[HMR]: Custom HMR message received: ${message.type}`);
        this.socketHolder.emit(message.type, message.payload);
        globalThis.__rollipop_runtime__?.customHMRHandler?.(socket, message);
        return;
      }

      switch (message.type) {
        case 'hmr:update':
          this.enqueueUpdate(message);
          break;

        case 'hmr:reload':
          this.reload();
          break;
      }
    });
  }

  private enqueueUpdate(message: Extract<HMRServerMessage, { type: 'hmr:update' }>) {
    this.applyQueue = this.applyQueue
      .then(() => this.applyPush(message))
      .catch((error) => {
        console.error('[HMR]: Failed to apply update', error);
        this.reload();
      });
  }

  private invalidateLocally(moduleId: string) {
    const firstInvalidatedBy = this.currentFirstInvalidatedBy ?? moduleId;
    this.applyQueue = this.applyQueue
      .then(() => this.applyInvalidate(moduleId, firstInvalidatedBy))
      .catch((error) => {
        console.error(`[HMR]: Failed to invalidate ${moduleId}`, error);
        this.reload();
      });
  }

  private applyPush({
    changedIds,
    code,
    filename,
    seq,
    sourceURL,
  }: Extract<HMRServerMessage, { type: 'hmr:update' }>) {
    if (seq !== this.lastSeq + 1) {
      this.reload(`HMR update sequence gap (expected ${this.lastSeq + 1}, got ${seq})`);
      return;
    }
    this.lastSeq = seq;

    const update = this.computeHmrUpdate(changedIds);
    if (update.type === 'noop') {
      return;
    }
    if (update.type === 'full-reload') {
      this.reload(update.reason);
      return;
    }

    this.evaluate(code, sourceURL);
    this.socketHolder.send(
      JSON.stringify({ type: 'hmr:payload-delivered', filename } satisfies HMRClientMessage),
    );
    this.applyUpdate(update);
  }

  private applyInvalidate(moduleId: string, firstInvalidatedBy: string) {
    const importers = this.getImporters(moduleId).filter((id) => this.isExecuted(id));
    if (importers.length === 0) {
      this.reload(`No importers to handle invalidate from ${moduleId}`);
      return;
    }

    const update = this.computeHmrUpdate(importers, firstInvalidatedBy);
    if (update.type === 'noop') {
      return;
    }
    if (update.type === 'full-reload') {
      this.reload(update.reason);
      return;
    }
    this.applyUpdate(update, firstInvalidatedBy);
  }

  private computeHmrUpdate(changedIds: string[], firstInvalidatedBy?: string): HMRUpdate {
    const boundaries: [string, string][] = [];
    const updateSet = new Set<string>();
    const traversedModules = new Set<string>();

    for (const changedId of changedIds) {
      if (!this.isExecuted(changedId)) {
        continue;
      }
      const fullReload = this.bubble(
        changedId,
        [changedId],
        updateSet,
        boundaries,
        traversedModules,
        firstInvalidatedBy,
      );
      if (fullReload != null) {
        return fullReload;
      }
    }

    return boundaries.length === 0
      ? { type: 'noop' }
      : { type: 'boundaries', boundaries, updateSet: [...updateSet] };
  }

  private bubble(
    moduleId: string,
    stack: string[],
    updateSet: Set<string>,
    boundaries: [string, string][],
    traversedModules: Set<string>,
    firstInvalidatedBy?: string,
  ): Extract<HMRUpdate, { type: 'full-reload' }> | undefined {
    if (traversedModules.has(moduleId)) {
      return;
    }
    traversedModules.add(moduleId);
    updateSet.add(moduleId);

    if (firstInvalidatedBy != null && moduleId === firstInvalidatedBy) {
      return {
        type: 'full-reload',
        reason: `Update propagated back to ${firstInvalidatedBy}`,
      };
    }

    if (this.isSelfAccepted(moduleId)) {
      boundaries.push([moduleId, moduleId]);
      return;
    }

    const importers = this.getImporters(moduleId).filter((id) => this.isExecuted(id));
    if (importers.length === 0) {
      return {
        type: 'full-reload',
        reason: `No HMR boundary found for ${moduleId}`,
      };
    }

    for (const importer of importers) {
      if (this.acceptsDependency(importer, moduleId)) {
        boundaries.push([importer, moduleId]);
        continue;
      }
      if (stack.includes(importer)) {
        return {
          type: 'full-reload',
          reason: `Circular import chain between ${moduleId} and ${importer}`,
        };
      }
      const fullReload = this.bubble(
        importer,
        [...stack, importer],
        updateSet,
        boundaries,
        traversedModules,
        firstInvalidatedBy,
      );
      if (fullReload != null) {
        return fullReload;
      }
    }
  }

  private isSelfAccepted(moduleId: string) {
    return (
      this.moduleHotContexts
        .get(moduleId)
        ?.acceptCallbacks.some((callback) => callback.deps.includes(moduleId)) ?? false
    );
  }

  private acceptsDependency(importer: string, dependency: string) {
    return (
      this.moduleHotContexts
        .get(importer)
        ?.acceptCallbacks.some((callback) => callback.deps.includes(dependency)) ?? false
    );
  }

  private applyUpdate(
    update: Extract<HMRUpdate, { type: 'boundaries' }>,
    firstInvalidatedBy?: string,
  ) {
    for (const moduleId of update.updateSet) {
      if (!this.hasFactory(moduleId)) {
        this.reload(`No factory registered for ${moduleId}`);
        return;
      }
    }

    const applies = update.boundaries.map(([boundary, acceptedVia]) => ({
      acceptedVia,
      callbacks:
        this.moduleHotContexts
          .get(boundary)
          ?.acceptCallbacks.filter((callback) => callback.deps.includes(acceptedVia)) ?? [],
    }));

    for (const moduleId of update.updateSet) {
      this.removeModuleCache(moduleId);
    }

    for (const { acceptedVia, callbacks } of applies) {
      this.initModule(acceptedVia);
      const freshExports = this.loadExports(acceptedVia);
      try {
        this.currentFirstInvalidatedBy = firstInvalidatedBy;
        for (const { deps, fn } of callbacks) {
          fn(deps.map((dependency) => (dependency === acceptedVia ? freshExports : undefined)));
        }
      } finally {
        this.currentFirstInvalidatedBy = undefined;
      }
    }

    for (const [moduleId, hotContext] of this.moduleHotContextsToBeUpdated) {
      this.moduleHotContexts.get(moduleId)?.cleanup();
      if (hotContext == null) {
        this.moduleHotContexts.delete(moduleId);
      } else {
        this.moduleHotContexts.set(moduleId, hotContext);
      }
    }
    this.moduleHotContextsToBeUpdated.clear();
  }

  private evaluate(code: string, sourceURL?: string) {
    debug(`[HMR]: Evaluating code\n${code}`);
    const resolvedSourceURL =
      sourceURL == null || this.socketHolder.origin == null
        ? sourceURL
        : new URL(sourceURL, `${this.socketHolder.origin}/`).toString();
    const source = [code, resolvedSourceURL == null ? null : `//# sourceURL=${resolvedSourceURL}`]
      .filter((line) => line != null)
      .join('\n');

    if (globalThis.globalEvalWithSourceUrl) {
      globalThis.globalEvalWithSourceUrl(source, resolvedSourceURL);
    } else {
      // oxlint-disable-next-line no-eval
      eval(source);
    }
  }

  private reload(reason?: string) {
    debug(`[HMR]: Reloading${reason == null ? '' : ` (${reason})`}`);
    const moduleName = 'DevSettings';
    (globalThis.__turboModuleProxy
      ? globalThis.__turboModuleProxy(moduleName)
      : globalThis.nativeModuleProxy[moduleName]
    ).reload();
  }
}

function createClientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function debug(...args: any[]) {
  if (process.env.DEBUG_ROLLIPOP) {
    console.log(...args);
  }
}

function isCustomHMRMessage(message: unknown): message is HMRCustomMessage {
  if (typeof message !== 'object' || message == null) {
    return false;
  }

  if ('type' in message && typeof message.type === 'string' && message.type.startsWith('hmr:')) {
    return false;
  }

  return true;
}

function createRollipopDevRuntime(): RollipopDevRuntime {
  const graphs = new Map<string, HMRGraph>();
  const graphListeners = new Set<(graph: HMRGraph) => void>();

  return {
    reactRefresh: lazyReactRefresh,
    customHMRHandler: undefined,
    graphs,
    registerGraph(graph) {
      const existing = graphs.get(graph.id);
      if (existing != null) {
        if (existing.runtime !== graph.runtime) {
          throw new Error(`[HMR]: ID "${graph.id}" is already registered`);
        }
        return;
      }

      graphs.set(graph.id, graph);
      for (const listener of graphListeners) {
        listener(graph);
      }
    },
    subscribeGraph(listener) {
      graphListeners.add(listener);
      return () => graphListeners.delete(listener);
    },
  };
}

globalThis.__rollipop_runtime__ ??= createRollipopDevRuntime();

/**
 * This exact binding name is used by generated main-bundle HMR calls. Each bundle owns its runtime instance.
 * Rollipop patches can select the matching instance through the graph registry.
 *
 * @see vite.config.ts
 *
 * **Build options**
 *
 * ```ts
 * { globalName: '__rolldown_runtime__' }
 * ```
 *
 * **Bundle**
 *
 * ```ts
 * var __rolldown_runtime__ = (function () {
 *   return new ReactNativeDevRuntime(); // <- Default exported instance
 * })();
 * ```
 */
export default new ReactNativeDevRuntime();
export type { DevRuntime };
