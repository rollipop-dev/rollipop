import type { InputOptions } from '@babel/core';
import { mergeWith } from 'es-toolkit';

export function mergeBabelOptions(options: InputOptions[]) {
  return options.reduce((acc, options) => mergeWith(acc, options, merge), {});
}

function merge(target: any, source: any, key: string) {
  if (key === 'plugins') {
    return [...(target ?? []), ...(source ?? [])];
  }
  if (key === 'presets') {
    return [...(target ?? []), ...(source ?? [])];
  }
}
