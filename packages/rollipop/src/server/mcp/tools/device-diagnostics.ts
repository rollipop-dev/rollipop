import type { RawData } from 'ws';

import type { DevServerContext } from '../../types';

export interface DeviceInfo {
  id: number;
  connected: boolean;
  connectedAt: string;
  disconnectedAt?: string;
  platform?: string;
  bundleEntry?: string;
}

export class DeviceDiagnostics {
  private devices = new Map<number, DeviceInfo>();

  constructor(context: DevServerContext) {
    context.eventBus.subscribe((event) => {
      switch (event.type) {
        case 'device_connected':
          this.devices.set(event.client.id, {
            id: event.client.id,
            connected: true,
            connectedAt: new Date().toISOString(),
          });
          break;

        case 'device_message':
          this.updateDeviceFromMessage(event.client.id, event.data);
          break;

        case 'device_disconnected': {
          const device = this.devices.get(event.client.id);
          if (device != null) {
            this.devices.set(event.client.id, {
              ...device,
              connected: false,
              disconnectedAt: new Date().toISOString(),
            });
          }
          break;
        }
      }
    });
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  private updateDeviceFromMessage(clientId: number, data: RawData) {
    const device = this.devices.get(clientId);
    if (device == null) {
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

      this.devices.set(clientId, {
        ...device,
        platform: message.platform,
        bundleEntry: message.bundleEntry,
      });
    } catch {
      // ignore non-JSON device messages
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
