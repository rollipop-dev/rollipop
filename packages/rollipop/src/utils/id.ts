import { pick } from 'es-toolkit';

import type { ResolvedConfig } from '../config';
import { ROLLIPOP_VERSION, ROLLIPOP_VIRTUAL_PREFIX } from '../constants';
import type { BuildOptions } from '../core/types';
import { md5 } from './hash';
import { serialize } from './serialize';

export function createId(config: ResolvedConfig, buildOptions: BuildOptions) {
  return md5(
    serialize([
      ROLLIPOP_VERSION,
      filterTransformAffectedOptions(buildOptions),
      filterTransformAffectedConfig(config),
    ]),
  );
}

function filterTransformAffectedOptions(buildOptions: BuildOptions) {
  return pick(buildOptions, ['platform', 'dev']);
}

function filterTransformAffectedConfig(config: ResolvedConfig) {
  const { transformer, serializer, reactNative, devMode, plugins = [] } = config;
  return [
    transformer,
    serializer.polyfills,
    serializer.prelude,
    reactNative.assetRegistryPath,
    devMode,
    plugins.map((plugin, index) => `${plugin.name}#${index}`),
  ];
}

export function createVirtualModuleId(path: string, query?: Record<string, string>) {
  return `${ROLLIPOP_VIRTUAL_PREFIX}${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`;
}

export function escapeVirtualModuleId(id: string) {
  return id.replace('\0', '\\0');
}
