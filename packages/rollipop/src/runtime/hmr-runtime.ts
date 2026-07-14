import mitt from 'mitt';

import type {
  HMRClientMessage,
  HMRCustomMessage,
  HMRServerMessage,
  HMRContext,
} from '../types/hmr';
import type {
  DevRuntime as DefaultDevRuntime,
  DevRuntimeMessenger,
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

class ModuleHotContext implements HMRContext {
  private readonly removeListeners: (() => void)[] = [];
  acceptCallbacks: { deps: string[]; fn: (moduleExports: Record<string, any>[]) => void }[] = [];

  constructor(
    private moduleId: string,
    private socketHolder: SocketHolder,
    readonly runtime: HMRGraphRuntime,
  ) {}

  accept(...args: any[]) {
    if (args.length === 1) {
      const [cb] = args;
      const acceptingPath = this.moduleId;
      this.acceptCallbacks.push({
        deps: [acceptingPath],
        fn: cb,
      });
    } else if (args.length === 0) {
      // noop
    } else {
      throw new Error('Invalid arguments for `import.meta.hot.accept`');
    }
  }

  invalidate() {
    this.socketHolder.send(
      JSON.stringify({
        type: 'hmr:invalidate',
        moduleId: this.moduleId,
      } satisfies HMRClientMessage),
    );
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
  socketHolder: SocketHolder;
  moduleHotContexts = new Map<string, ModuleHotContext>();
  moduleHotContextsToBeUpdated = new Map<string, ModuleHotContext>();

  constructor() {
    const socketHolder = new SocketHolder();
    const messenger: DevRuntimeMessenger = {
      send: (message) => socketHolder.send(JSON.stringify(message)),
    };
    super(messenger);
    this.socketHolder = socketHolder;
  }

  createModuleHotContext(moduleId: string) {
    const hotContext = new ModuleHotContext(moduleId, this.socketHolder, this);
    if (this.moduleHotContexts.has(moduleId)) {
      this.moduleHotContextsToBeUpdated.set(moduleId, hotContext);
    } else {
      this.moduleHotContexts.set(moduleId, hotContext);
    }
    return hotContext;
  }

  applyUpdates(boundaries: [string, string][]) {
    for (let [moduleId, _acceptedVia] of boundaries) {
      const hotContext = this.moduleHotContexts.get(moduleId);
      if (hotContext) {
        const acceptCallbacks = hotContext.acceptCallbacks;
        acceptCallbacks.filter((cb) => {
          cb.fn(this.modules[moduleId].exports);
        });
        hotContext.cleanup();
      }
    }
    this.moduleHotContextsToBeUpdated.forEach((hotContext, moduleId) => {
      this.moduleHotContexts.set(moduleId, hotContext);
    });
    this.moduleHotContextsToBeUpdated.clear();
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
          this.evaluate(message.code, message.sourceURL, message.sourceMappingURL);
          break;

        case 'hmr:reload':
          this.reload();
          break;
      }
    });
  }

  private evaluate(code: string, sourceURL?: string, sourceMappingURL?: string) {
    debug(`[HMR]: Evaluating code\n${code}`);
    const resolvedSourceURL =
      sourceURL == null || this.socketHolder.origin == null
        ? sourceURL
        : new URL(sourceURL, `${this.socketHolder.origin}/`).toString();
    const source = [
      code,
      sourceMappingURL == null ? null : `//# sourceMappingURL=${sourceMappingURL}`,
      resolvedSourceURL == null ? null : `//# sourceURL=${resolvedSourceURL}`,
    ]
      .filter((line) => line != null)
      .join('\n');

    if (globalThis.globalEvalWithSourceUrl) {
      globalThis.globalEvalWithSourceUrl(source, resolvedSourceURL);
    } else {
      // oxlint-disable-next-line no-eval
      eval(source);
    }
  }

  private reload() {
    debug(`[HMR]: Reloading`);
    const moduleName = 'DevSettings';
    (globalThis.__turboModuleProxy
      ? globalThis.__turboModuleProxy(moduleName)
      : globalThis.nativeModuleProxy[moduleName]
    ).reload();
  }
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
