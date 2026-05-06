import mitt from 'mitt';

import type {
  DevRuntime as DefaultDevRuntime,
  DevRuntimeMessenger,
  HMRClientMessage,
  HMRCustomHandler,
  HMRCustomMessage,
  HMRServerMessage,
  HMRContext,
} from '../types/hmr';
import { enqueueUpdate, isReactRefreshBoundary } from './react-refresh-utils';

declare global {
  var __rolldown_runtime__: ReactNativeDevRuntime;
  var __turboModuleProxy: (moduleName: string) => any;
  var globalEvalWithSourceUrl: (code: string, sourceURL?: string) => void;
  var nativeModuleProxy: Record<string, any>;
  var __ReactRefresh: any;
}

declare global {
  var __ROLLIPOP_CUSTOM_HMR_HANDLER__: HMRCustomHandler | undefined;
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
  ) {}

  get refresh() {
    return globalThis.__ReactRefresh;
  }

  get refreshUtils() {
    return {
      isReactRefreshBoundary,
      enqueueUpdate,
    };
  }

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
    const hotContext = new ModuleHotContext(moduleId, this.socketHolder);
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
        globalThis.__ROLLIPOP_CUSTOM_HMR_HANDLER__?.(socket, message);
        return;
      }

      switch (message.type) {
        case 'hmr:update':
          this.evaluate(message.code);
          break;

        case 'hmr:reload':
          this.reload();
          break;
      }
    });
  }

  private evaluate(code: string, sourceURL?: string) {
    debug(`[HMR]: Evaluating code\n${code}`);
    if (globalThis.globalEvalWithSourceUrl) {
      globalThis.globalEvalWithSourceUrl(code, sourceURL);
    } else {
      // oxlint-disable-next-line no-eval
      eval(code);
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

globalThis.__rolldown_runtime__ ??= new ReactNativeDevRuntime();

export type { DevRuntime };
