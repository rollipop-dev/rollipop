import { pick } from 'es-toolkit';

import type { ResolvedConfig } from '../config';
import { ROLLIPOP_VERSION, ROLLIPOP_VIRTUAL_PREFIX } from '../constants';
import type { ResolvedBuildOptions } from './build-options';
import { md5 } from './hash';
import { serialize } from './serialize';

export function createId(config: ResolvedConfig, buildOptions: ResolvedBuildOptions) {
  return md5(
    serialize([
      ROLLIPOP_VERSION,
      filterTransformAffectedOptions(buildOptions),
      filterTransformAffectedConfig(config),
    ]),
  );
}

function filterTransformAffectedOptions(buildOptions: ResolvedBuildOptions) {
  return pick(buildOptions, ['platform', 'dev', 'minify']);
}

function filterTransformAffectedConfig(config: ResolvedConfig) {
  const { plugins = [] } = config;
  return [
    pick(config, [
      'mode',
      'transform',
      'output',
      'treeshake',
      'moduleTypes',
      'tsconfig',
      'prelude',
      'polyfills',
      'reactNative',
      'dev',
      'envDir',
      'envFile',
      'envPrefix',
      'runtimeTarget',
      'experimental',
      'rolldownOptions',
    ]),
    plugins.map((plugin, index) => `${plugin.name}#${index}`),
  ];
}

export function createVirtualModuleId(path: string, query?: Record<string, string>) {
  return `${ROLLIPOP_VIRTUAL_PREFIX}${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`;
}

export function escapeVirtualModuleId(id: string) {
  return id.replace('\0', '\\0');
}
