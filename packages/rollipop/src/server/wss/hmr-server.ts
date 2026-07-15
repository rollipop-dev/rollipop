import type * as rolldownExperimental from '@rollipop/rolldown/experimental';
import { invariant } from 'es-toolkit';
import type * as ws from 'ws';

import type { EventBus } from '../../events/event-bus';
import { isEventForBundler } from '../../events/utils';
import type {
  HMRClientMessage,
  HMRCustomMessage,
  HMRServerError,
  HMRServerMessage,
} from '../../types/hmr';
import type { BundlerDevEngine, BundlerPool } from '../bundler-pool';
import { getHotUpdatePath } from '../hot-update-store';
import { type WebSocketClient, WebSocketServer } from './server';

export interface HMRServerOptions {
  bundlerPool: BundlerPool;
  eventBus: EventBus;
}

interface Bindings {
  unsubscribe: () => void;
}

const MAX_PENDING_PAYLOADS_PER_CLIENT = 8;

export class HMRServer extends WebSocketServer {
  private bundlerPool: BundlerPool;
  private eventBus: EventBus;
  private instances: Map<number, BundlerDevEngine> = new Map();
  private bindings: Map<number, Bindings> = new Map();
  private runtimeClientIds: Map<number, string> = new Map();
  private connectionTokens: Map<number, symbol> = new Map();
  private pendingPayloads: Map<number, Set<string>> = new Map();

  constructor({ bundlerPool, eventBus }: HMRServerOptions) {
    super('hmr', { noServer: true });
    this.bundlerPool = bundlerPool;
    this.eventBus = eventBus;
  }

  private parseClientMessage(data: ws.RawData) {
    const parsedData = JSON.parse(this.rawDataToString(data));
    const clientMessage = 'type' in parsedData ? (parsedData as HMRClientMessage) : null;
    invariant(clientMessage, 'Invalid HMR client message');

    return clientMessage;
  }

  private async handleConnected(
    client: WebSocketClient,
    runtimeClientId: string,
    platform: string,
    bundleEntry: string,
  ) {
    const connectionToken = Symbol();
    this.connectionTokens.set(client.id, connectionToken);

    try {
      this.logger.trace(`HMR client connected (clientId: ${runtimeClientId})`, {
        platform,
        bundleEntry,
      });
      const devEngineInstance = this.bundlerPool.get(bundleEntry, {
        platform,
        dev: true,
      });
      this.instances.set(client.id, devEngineInstance);

      await devEngineInstance.ensureInitialized;
      if (this.connectionTokens.get(client.id) !== connectionToken) {
        return;
      }

      await devEngineInstance.devEngine.registerClient(runtimeClientId);
      if (this.connectionTokens.get(client.id) !== connectionToken) {
        await devEngineInstance.devEngine.removeClient(runtimeClientId);
        return;
      }

      this.runtimeClientIds.set(client.id, runtimeClientId);
      this.pendingPayloads.set(client.id, new Set());
      this.bindEvents(client, devEngineInstance);
      this.logger.trace(`Bundler instance prepared (bundlerId: ${devEngineInstance.id})`);
    } catch (error) {
      if (this.connectionTokens.get(client.id) === connectionToken) {
        this.connectionTokens.delete(client.id);
        this.instances.delete(client.id);
      }
      this.logger.error(`Failed to prepare bundler instance`, error);
    }
  }

  private bindEvents(client: WebSocketClient, instance: BundlerDevEngine) {
    const existingBindings = this.bindings.get(client.id);

    if (existingBindings == null) {
      const unsubscribe = this.eventBus.subscribe((event) => {
        if (!isEventForBundler(event, instance.id)) {
          return;
        }

        switch (event.type) {
          case 'hmr_updates':
            void this.handleUpdates(client, instance, event.updates);
            break;

          case 'hmr_failed':
            this.sendBuildFailed(client, event.error);
            break;
        }
      });

      this.bindings.set(client.id, { unsubscribe });
      this.logger.trace(`HMR event binding established (clientId: ${client.id})`);
    }
  }

  private sendBuildFailed(client: WebSocketClient, error: Error) {
    this.send(
      client,
      JSON.stringify({
        type: 'hmr:error',
        payload: {
          type: 'BuildError',
          errors: [{ description: error.message }],
          message: error.message,
        },
      } satisfies HMRServerMessage),
    );
  }

  private async handleUpdates(
    client: WebSocketClient,
    instance: BundlerDevEngine,
    updates: rolldownExperimental.BindingClientHmrUpdate[],
  ) {
    const runtimeClientId = this.runtimeClientIds.get(client.id);
    if (runtimeClientId == null) {
      return;
    }

    this.logger.trace(`HMR updates found (clientId: ${client.id})`, {
      updatesCount: updates.length,
    });

    const actionableUpdates = updates.filter(
      (clientUpdate) =>
        clientUpdate.clientId === runtimeClientId && clientUpdate.update.type !== 'Noop',
    );
    if (actionableUpdates.length === 0) {
      return;
    }

    this.send(client, JSON.stringify({ type: 'hmr:update-start' } satisfies HMRServerMessage));

    for (const clientUpdate of actionableUpdates) {
      const update = clientUpdate.update;
      switch (update.type) {
        case 'Patch':
          this.sendUpdateToClient(client, instance.id, update);
          break;

        case 'FullReload':
          this.sendReloadToClient(client);
          break;

        case 'Noop':
          break;
      }
    }

    this.done(client);
  }

  private sendUpdateToClient(
    client: WebSocketClient,
    id: string,
    update: rolldownExperimental.BindingClientHmrUpdate['update'],
  ) {
    invariant(update.type === 'Patch', 'Invalid HMR update type');

    const pendingPayloads = this.pendingPayloads.get(client.id);
    invariant(pendingPayloads != null, `Pending payloads not found for client: ${client.id}`);
    pendingPayloads.add(update.filename);
    while (pendingPayloads.size > MAX_PENDING_PAYLOADS_PER_CLIENT) {
      const oldestFilename = pendingPayloads.values().next().value;
      if (oldestFilename == null) {
        break;
      }
      pendingPayloads.delete(oldestFilename);
    }

    const updateMessage = {
      type: 'hmr:update',
      code: update.code,
      filename: update.filename,
      sourceURL: getHotUpdatePath(id, update.filename),
      changedIds: update.changedIds,
      seq: update.seq,
    } satisfies HMRServerMessage;

    this.send(client, JSON.stringify(updateMessage));
  }

  private sendReloadToClient(client: WebSocketClient) {
    this.logger.trace(`Sending HMR reload message to client (clientId: ${client.id})`);
    const reloadMessage = {
      type: 'hmr:reload',
    } satisfies HMRServerMessage;

    this.send(client, JSON.stringify(reloadMessage));
  }

  private async handlePayloadDelivered(client: WebSocketClient, filename: string) {
    const pendingPayloads = this.pendingPayloads.get(client.id);
    if (pendingPayloads == null || !pendingPayloads.delete(filename)) {
      this.logger.trace(`Ignored unknown HMR payload delivery (clientId: ${client.id})`, {
        filename,
      });
      return;
    }

    const instance = this.instances.get(client.id);
    if (instance == null) {
      return;
    }

    try {
      await instance.devEngine.notifyPayloadDelivered(filename);
    } catch (error) {
      this.logger.error(`Failed to handle HMR payload delivery`, error);
    }
  }

  private done(client: WebSocketClient) {
    const updateDoneMessage = {
      type: 'hmr:update-done',
    } satisfies HMRServerMessage;
    this.send(client, JSON.stringify(updateDoneMessage));
  }

  private sendError(client: WebSocketClient, error: HMRServerError) {
    try {
      this.send(client, JSON.stringify(error));
    } catch (error) {
      this.logger.error(
        `Failed to send HMR error message to client (clientId: ${client.id})`,
        error,
      );
    }
  }

  private cleanup(client: WebSocketClient) {
    this.logger.trace(`HMR client cleanup (clientId: ${client.id})`);
    const binding = this.bindings.get(client.id);
    const instance = this.instances.get(client.id);
    const runtimeClientId = this.runtimeClientIds.get(client.id);

    this.connectionTokens.delete(client.id);

    if (binding != null) {
      binding.unsubscribe();
    }

    if (instance != null && runtimeClientId != null) {
      try {
        void instance.devEngine.removeClient(runtimeClientId).catch((error) => {
          this.logger.warn(
            `Failed to remove HMR client ${runtimeClientId}: ` +
              (error instanceof Error ? error.message : String(error)),
          );
        });
      } catch (error) {
        this.logger.warn(
          `Failed to remove HMR client ${runtimeClientId}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    this.bindings.delete(client.id);
    this.instances.delete(client.id);
    this.runtimeClientIds.delete(client.id);
    this.pendingPayloads.delete(client.id);
  }

  protected onMessage(client: WebSocketClient, data: ws.RawData): void {
    let message: HMRClientMessage;

    try {
      message = this.parseClientMessage(data);

      let traceMessage: any = message;
      if (message.type === 'hmr:log') {
        traceMessage = { ...message, data: `(${message.data.length} items)` };
      }
      this.logger.trace('HMR client message received', traceMessage);
    } catch (error) {
      const message = 'Failed to parse HMR client message';
      this.logger.error(message, error);
      this.sendError(client, {
        type: 'InternalError',
        errors: [{ description: error instanceof Error ? error.message : String(error) }],
        message,
      });
      return;
    }

    if (isCustomHMRMessage(message)) {
      this.wss.emit(message.type, message.payload);
      return;
    }

    switch (message.type) {
      case 'hmr:connected':
        void this.handleConnected(client, message.clientId, message.platform, message.bundleEntry);
        break;

      case 'hmr:payload-delivered':
        void this.handlePayloadDelivered(client, message.filename);
        break;

      case 'hmr:log': {
        const instance = this.instances.get(client.id);
        this.eventBus.emit({
          type: 'client_log',
          ...(instance != null ? { bundlerId: instance.id } : {}),
          level: message.level,
          data: message.data,
        });
        break;
      }
    }
  }

  protected onConnection(client: WebSocketClient): void {
    this.logger.trace(`connection established (clientId: ${client.id})`);
  }

  protected onError(client: WebSocketClient, error: Error): void {
    this.logger.error(`connection error (clientId: ${client.id})`, error);
    this.cleanup(client);
  }

  protected onClose(client: WebSocketClient): void {
    this.logger.trace(`connection closed (clientId: ${client.id})`);
    this.cleanup(client);
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
