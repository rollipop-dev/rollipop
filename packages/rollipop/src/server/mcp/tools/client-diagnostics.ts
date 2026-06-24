import type { RawData } from 'ws';

import type { DevServerContext } from '../../types';

export interface ClientInfo {
  id: number;
  connected: boolean;
  connectedAt: string;
  disconnectedAt?: string;
  platform?: string;
  bundleEntry?: string;
}

export class ClientDiagnostics {
  private clients = new Map<number, ClientInfo>();

  constructor(context: DevServerContext) {
    context.eventBus.subscribe((event) => {
      switch (event.type) {
        case 'client_connected':
          this.clients.set(event.client.id, {
            id: event.client.id,
            connected: true,
            connectedAt: new Date().toISOString(),
          });
          break;

        case 'client_message':
          this.updateClientFromMessage(event.client.id, event.data);
          break;

        case 'client_disconnected': {
          const client = this.clients.get(event.client.id);
          if (client != null) {
            this.clients.set(event.client.id, {
              ...client,
              connected: false,
              disconnectedAt: new Date().toISOString(),
            });
          }
          break;
        }
      }
    });
  }

  getClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  private updateClientFromMessage(clientId: number, data: RawData) {
    const client = this.clients.get(clientId);
    if (client == null) {
      return;
    }

    try {
      const message = JSON.parse(rawDataToString(data)) as {
        type?: string;
        platform?: string;
        bundleEntry?: string;
      };

      if (message.type !== 'hmr:connected') {
        return;
      }

      this.clients.set(clientId, {
        ...client,
        platform: message.platform,
        bundleEntry: message.bundleEntry,
      });
    } catch {
      // ignore non-JSON client messages
    }
  }
}

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data).toString('utf8');
}
