import fp from 'fastify-plugin';

import type { DevServerContext } from '../types';
import { actionsRest } from './domains/actions';
import { buildsRest } from './domains/builds';
import { bundlersRest } from './domains/bundlers';
import { configRest } from './domains/config';
import { devServerRest } from './domains/dev-server';
import { devicesRest } from './domains/devices';
import { featureFlagsRest } from './domains/feature-flags';
import { snapshotRest } from './domains/snapshot';

export interface RestPluginOptions {
  context: DevServerContext;
}

const apiPlugin = fp<RestPluginOptions>(
  (api, options) => {
    const { context } = options;

    api.register(snapshotRest, { context, prefix: '/snapshot' });
    api.register(devServerRest, { context, prefix: '/dev-server' });
    api.register(bundlersRest, { context, prefix: '/bundlers' });
    api.register(buildsRest, { context, prefix: '/builds' });
    api.register(devicesRest, { context, prefix: '/devices' });
    api.register(configRest, { context, prefix: '/config' });
    api.register(featureFlagsRest, { context, prefix: '/feature-flags' });
    api.register(actionsRest, { context, prefix: '/actions' });
  },
  { name: 'rest-api', encapsulate: true },
);

const plugin = fp<RestPluginOptions>(
  (fastify, options) => {
    fastify.register(apiPlugin, { ...options, prefix: '/api' });
  },
  { name: 'rest' },
);

export { plugin as rest };
