import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getDevice, getDevices } from '../data';
import { sendNotFound } from '../response';

export interface DevicesRestOptions {
  context: DevServerContext;
}

export const devicesRest = fp<DevicesRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return getDevices(context);
    });

    fastify.get<{ Params: { deviceId: string } }>('/:deviceId', async (request, reply) => {
      const device = await getDevice(context, request.params.deviceId);

      if (device == null) {
        return sendNotFound(reply, `Device not found: ${request.params.deviceId}`);
      }

      return device;
    });
  },
  { name: 'rest-devices', encapsulate: true },
);
