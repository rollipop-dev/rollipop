import fp from 'fastify-plugin';

import type { DevServerContext } from '../../types';
import { getFeatureFlags } from '../data';

export interface FeatureFlagsRestOptions {
  context: DevServerContext;
}

export const featureFlagsRest = fp<FeatureFlagsRestOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.get('/', () => {
      return getFeatureFlags(context);
    });
  },
  { name: 'rest-feature-flags', encapsulate: true },
);
