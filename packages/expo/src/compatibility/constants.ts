import fs from 'node:fs';

export const CONSTANTS_MODULE = /[/\\]expo-constants[/\\]build[/\\]Constants\.js$/;

export function loadClassicHermesConstants(filename: string): string {
  // Hermes HostObjects expose enumerable descriptors but return false from propertyIsEnumerable. Normalize this native module before SWC's object-rest helper reads it.
  return fs
    .readFileSync(filename, 'utf8')
    .replace(
      'const { name, appOwnership, ...nativeConstants } = (ExponentConstants || {});',
      'const { name, appOwnership, ...nativeConstants } = Object.fromEntries(Object.keys(ExponentConstants || {}).map(key => [key, ExponentConstants[key]]));',
    );
}
