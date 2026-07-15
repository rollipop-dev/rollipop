import prettyFormat from 'pretty-format';

import LogBox from '../LogBox/LogBox';
import NativeRedBox from '../NativeModules/specs/NativeRedBox';
import type { HMRClientLogLevel, HMRClientMessage, HMRServerMessage } from '../types/hmr';
import type { HMRGraph } from '../types/runtime';
import DevLoadingView from './DevLoadingView';
import Platform from './Platform';

declare var __DEV__: boolean;

/**
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/react-native/Libraries/Utilities/HMRClient.js#L42-L55
 */
interface HMRClientNativeInterface {
  enable(): void;
  disable(): void;
  registerBundle(requestUrl: string): void;
  log(level: string, data: any[]): void;
  setup(
    platform: string,
    bundleEntry: string,
    host: string,
    port: number | string,
    isEnabled: boolean,
    scheme?: string,
  ): void;
}

interface HMRConnection {
  graph: HMRGraph;
  socket: WebSocket;
  unavailableMessage: string | null;
  compileErrorMessage: string | null;
  pendingUpdatesCount: number;
}

class HMRClient implements HMRClientNativeInterface {
  static readonly STARTUP_ERROR = 'Expected HMRClient.setup() call at startup';
  static readonly MAX_PENDING_LOGS = 100;

  private readonly connections = new Map<string, HMRConnection>();
  private readonly pendingLogs: [HMRClientLogLevel, any[]][] = [];
  private enabled = true;
  private started = false;
  private hostId: string | null = null;
  private hostOrigin: string | null = null;
  private hostBundleEntry: string | null = null;

  enable() {
    const unavailableConnection = [...this.connections.values()].find(
      (connection) => connection.unavailableMessage != null,
    );
    if (unavailableConnection?.unavailableMessage != null) {
      throw new Error(unavailableConnection.unavailableMessage);
    }

    if (!this.started) {
      throw new Error(HMRClient.STARTUP_ERROR);
    }

    this.enabled = true;
    for (const connection of this.connections.values()) {
      this.showCompileErrorIfNeeded(connection);
    }
  }

  disable() {
    this.enabled = false;
  }

  registerBundle(requestUrl: string) {
    if (!this.started) {
      throw new Error(HMRClient.STARTUP_ERROR);
    }

    if (![...this.connections.values()].some(({ graph }) => requestUrl.startsWith(graph.origin))) {
      console.warn(`[HMR]: Cannot register bundle from unknown origin:\n${requestUrl}`);
    }

    // Nothing else to do for Rollipop HMR runtime.
  }

  log(level: HMRClientLogLevel, data: any[]) {
    const host = this.getHostConnection();
    if (host == null) {
      this.pendingLogs.push([level, data]);
      if (this.pendingLogs.length > HMRClient.MAX_PENDING_LOGS) {
        this.pendingLogs.shift();
      }
      return;
    }

    try {
      const prettifyData = data.map((item) =>
        typeof item === 'string'
          ? item
          : prettyFormat.format(item, {
              escapeString: true,
              highlight: true,
              maxDepth: 3,
              min: true,
              plugins: [prettyFormat.plugins.ReactElement],
            }),
      );

      this.send(host, { type: 'hmr:log', level, data: prettifyData });
    } catch {}
  }

  setup(
    platform: string,
    bundleEntry: string,
    host: string,
    port: number | string,
    isEnabled = true,
    protocol = 'http',
  ) {
    if (!__DEV__) {
      throw new Error('HMR is only available in development mode');
    }

    if (this.started) {
      throw new Error('Cannot initialize HMRClient more than once');
    }

    if (platform == null) {
      throw new Error('Missing required parameter `platform`');
    }

    if (bundleEntry == null) {
      throw new Error('Missing required parameter `bundleEntry`');
    }

    if (host == null) {
      throw new Error('Missing required parameter `host`');
    }

    // `HMRClient.setup()` is called by the host runtime.
    const serverHost = port !== null && port !== '' ? `${host}:${port}` : host;
    this.hostOrigin = `${protocol}://${serverHost}`;
    this.hostBundleEntry = bundleEntry;
    this.enabled = isEnabled;
    this.started = true;

    const runtime = globalThis.__rollipop_runtime__;
    if (runtime == null) {
      throw new Error('Rollipop dev runtime is not initialized');
    }

    for (const graph of runtime.graphs.values()) {
      this.connectGraph(graph);
    }
    runtime.subscribeGraph((graph) => this.connectGraph(graph));
  }

  private connectGraph(graph: HMRGraph) {
    if (this.connections.has(graph.id)) {
      return;
    }

    const socket = new globalThis.WebSocket(`${graph.origin}/hot`);
    const connection: HMRConnection = {
      graph,
      socket,
      unavailableMessage: null,
      compileErrorMessage: null,
      pendingUpdatesCount: 0,
    };
    this.connections.set(graph.id, connection);

    const isHostGraph =
      this.hostId == null &&
      graph.origin === this.hostOrigin &&
      graph.bundleEntry === this.hostBundleEntry;

    if (isHostGraph) {
      this.hostId = graph.id;
    }

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          type: 'hmr:connected',
          clientId: graph.runtime.clientId,
          bundleEntry: graph.bundleEntry,
          platform: graph.platform,
        } satisfies HMRClientMessage),
      );
      this.handleConnection(connection);
    });

    socket.addEventListener('error', (event) => {
      this.handleConnectionError(connection, event.error);
    });
    socket.addEventListener('message', (event) => this.handleMessage(connection, event));
    socket.addEventListener('close', (event) => this.handleClose(connection, event));

    graph.runtime.setup(socket, graph.origin);
  }

  private getHostConnection() {
    if (this.hostId != null) {
      return this.connections.get(this.hostId) ?? null;
    }
    return this.connections.values().next().value ?? null;
  }

  private send(connection: HMRConnection, payload: HMRClientMessage) {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(payload));
    }
  }

  private flushEarlyLogs(connection: HMRConnection) {
    if (
      connection !== this.getHostConnection() ||
      connection.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    for (const [level, data] of this.pendingLogs) {
      this.send(connection, { type: 'hmr:log', level, data });
    }
    this.pendingLogs.length = 0;
  }

  private dismissRedbox() {
    if (Platform.OS === 'ios' && NativeRedBox != null && NativeRedBox.dismiss != null) {
      NativeRedBox.dismiss();
    } else {
      const NativeExceptionsManager = require('../Core/NativeExceptionsManager').default as {
        dismissRedbox?: () => void;
      };
      NativeExceptionsManager?.dismissRedbox?.();
    }
  }

  private showCompileErrorIfNeeded(connection: HMRConnection) {
    if (connection.compileErrorMessage == null) {
      return;
    }

    this.dismissRedbox();
    const error = new Error(`[${connection.graph.id}] ${connection.compileErrorMessage}`);
    connection.compileErrorMessage = null;
    Object.defineProperty(error, 'preventSymbolication', { value: true });
    throw error;
  }

  private showUnavailableMessageIfNeeded(connection: HMRConnection) {
    if (connection.unavailableMessage == null) {
      return;
    }

    DevLoadingView.hide();
    if (this.enabled) {
      DevLoadingView.showMessage(
        `Fast Refresh disconnected (${connection.graph.id}). Reload app to reconnect.`,
        'error',
        { dismissButton: true },
      );
      console.warn(connection.unavailableMessage);
    }
  }

  private handleConnection(connection: HMRConnection) {
    connection.unavailableMessage = null;
    DevLoadingView.hide();
    this.flushEarlyLogs(connection);
  }

  private handleConnectionError(connection: HMRConnection, error: Error) {
    const { graph } = connection;
    let errorMessage =
      `Cannot connect to Rollipop graph "${graph.id}".\n\n` +
      'Try the following to fix the issue:\n' +
      '- Ensure that Rollipop is running and available on the same network';

    if (Platform.OS === 'ios') {
      errorMessage += '- Ensure that the Rollipop URL is correctly set in AppDelegate';
    } else {
      errorMessage +=
        `- Ensure that your device/emulator is connected to your machine and has USB debugging enabled - run 'adb devices' to see a list of connected devices\n` +
        `- If you're on a physical device connected to the same machine, run 'adb reverse tcp:8081 tcp:8081' to forward requests from your device\n` +
        `- If your device is on the same Wi-Fi network, set 'Debug server host & port for device' in 'Dev settings' to your machine's IP address and the port of the local dev server - e.g. 10.0.1.1:8081`;
    }

    errorMessage += `\n\nURL: ${graph.origin}` + `\n\nError: ${error?.message ?? 'Unknown error'}`;
    connection.unavailableMessage ??= errorMessage;
    this.showCompileErrorIfNeeded(connection);
  }

  private handleMessage(connection: HMRConnection, message: MessageEvent) {
    const data = JSON.parse(String(message.data)) as HMRServerMessage;
    if (!this.enabled && data.type.startsWith('hmr:')) {
      return;
    }

    switch (data.type) {
      case 'hmr:update-start':
        connection.pendingUpdatesCount++;
        connection.compileErrorMessage = null;
        DevLoadingView.showMessage(`Refreshing ${connection.graph.id}...`, 'refresh');
        break;
      case 'hmr:update':
        this.dismissRedbox();
        LogBox.clearAllLogs();
        break;
      case 'hmr:update-done':
        connection.pendingUpdatesCount = Math.max(0, connection.pendingUpdatesCount - 1);
        if (![...this.connections.values()].some((item) => item.pendingUpdatesCount > 0)) {
          DevLoadingView.hide();
        }
        break;
      case 'hmr:error':
        connection.compileErrorMessage = data.payload.message;
        this.showCompileErrorIfNeeded(connection);
        break;
    }
  }

  private handleClose(connection: HMRConnection, event: CloseEvent) {
    const { code, reason } = event;
    // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
    // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.1.5
    const isNormalOrUnsetCloseReason = code === 1000 || code === 1005;
    const message = isNormalOrUnsetCloseReason
      ? `Disconnected from Rollipop graph "${connection.graph.id}".`
      : `Disconnected from Rollipop graph "${connection.graph.id}" (${code}: "${reason}").`;

    connection.unavailableMessage ??=
      message +
      '\n\nTo reconnect:\n' +
      '- Ensure that Rollipop is running and available on the same network\n' +
      '- Reload this app\n';
    this.showUnavailableMessageIfNeeded(connection);
  }
}

const instance = new HMRClient();

// For compatibility with CommonJS modules.
//
// ```ts
// import HMRClient from '/path/to/hmr-client';
// const HMRClient = require('/path/to/hmr-client');
// const HMRClient = require('/path/to/hmr-client').default;
// ```
export default Object.defineProperty(instance, 'default', {
  get: () => instance,
});
