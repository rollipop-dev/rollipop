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
import { type WebSocketClient, WebSocketServer } from './server';

export interface HMRServerOptions {
  bundlerPool: BundlerPool;
  eventBus: EventBus;
}

interface Bindings {
  unsubscribe: () => void;
}

export class HMRServer extends WebSocketServer {
  private bundlerPool: BundlerPool;
  private eventBus: EventBus;
  private instances: Map<number, BundlerDevEngine> = new Map();
  private bindings: Map<number, Bindings> = new Map();

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

  private async handleConnected(client: WebSocketClient, platform: string, bundleEntry: string) {
    try {
      this.logger.trace(`HMR client connected (clientId: ${client.id})`, { platform, bundleEntry });
      const devEngineInstance = this.bundlerPool.get(bundleEntry, {
        platform,
        dev: true,
      });

      this.bindEvents(client, devEngineInstance);
      this.instances.set(client.id, devEngineInstance);
      this.logger.trace(`Bundler instance prepared (bundlerId: ${devEngineInstance.id})`);
    } catch (error) {
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
            void this.handleUpdates(client, event.updates);
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

  private async handleModuleRegistered(client: WebSocketClient, modules: string[]) {
    try {
      const instance = this.instances.get(client.id);
      invariant(instance != null, `Bundler instance not found for client clientId: ${client.id}`);

      await instance.ensureInitialized;
      await instance.devEngine.registerModules(client.id.toString(), modules);
    } catch (error) {
      this.logger.error(`Failed to handle module registered`, error);
    }
  }

  private async handleInvalidate(client: WebSocketClient, moduleId: string) {
    try {
      const instance = this.instances.get(client.id);
      invariant(instance != null, `Bundler instance not found for client clientId: ${client.id}`);

      await instance.ensureInitialized;
      const updates = await instance.devEngine.invalidate(moduleId);
      await this.handleUpdates(client, updates);
    } catch (error) {
      this.logger.error(`Failed to handle invalidate`, error);
    }
  }

  private async handleUpdates(
    client: WebSocketClient,
    updates: rolldownExperimental.BindingClientHmrUpdate[],
  ) {
    this.logger.trace(`HMR updates found (clientId: ${client.id})`, {
      updatesCount: updates.length,
    });

    const actionableUpdates = updates.filter((clientUpdate) => clientUpdate.update.type !== 'Noop');
    if (actionableUpdates.length === 0) {
      return;
    }

    this.send(client, JSON.stringify({ type: 'hmr:update-start' } satisfies HMRServerMessage));

    for (const clientUpdate of actionableUpdates) {
      const update = clientUpdate.update;
      switch (update.type) {
        case 'Patch':
          this.sendUpdateToClient(client, update);
          break;

        case 'FullReload':
          this.sendReloadToClient(client);
          break;

        case 'Noop':
          break;
      }
    }
  }

  private sendUpdateToClient(
    client: WebSocketClient,
    update: rolldownExperimental.BindingClientHmrUpdate['update'],
  ) {
    invariant(update.type === 'Patch', 'Invalid HMR update type');

    const updateMessage = {
      type: 'hmr:update',
      code: update.code,
    } satisfies HMRServerMessage;

    this.send(client, JSON.stringify(updateMessage));
    this.done(client);
  }

  private sendReloadToClient(client: WebSocketClient) {
    this.logger.trace(`Sending HMR reload message to client (clientId: ${client.id})`);
    const reloadMessage = {
      type: 'hmr:reload',
    } satisfies HMRServerMessage;

    this.send(client, JSON.stringify(reloadMessage));
    this.done(client);
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

    if (binding != null) {
      binding.unsubscribe();
    }

    if (instance != null) {
      try {
        void instance.devEngine.removeClient(String(client.id));
      } catch (error) {
        // `devEngine` throws an invariant error if the client disconnects
        // before the underlying bundler finishes initializing. Log and
        // continue so the cleanup path isn't left half-done.
        this.logger.warn(
          `Skipped devEngine.removeClient for client ${client.id}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    this.bindings.delete(client.id);
    this.instances.delete(client.id);
  }

  protected onMessage(client: WebSocketClient, data: ws.RawData): void {
    let message: HMRClientMessage;

    try {
      message = this.parseClientMessage(data);

      let traceMessage: any = message;
      if (message.type === 'hmr:module-registered') {
        traceMessage = { ...message, modules: `[${message.modules.length} modules]` };
      } else if (message.type === 'hmr:log') {
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
        void this.handleConnected(client, message.platform, message.bundleEntry);
        break;

      case 'hmr:module-registered':
        void this.handleModuleRegistered(client, message.modules);
        break;

      case 'hmr:invalidate':
        void this.handleInvalidate(client, message.moduleId);
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
