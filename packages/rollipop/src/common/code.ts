import dedent from 'dedent';

import { indent } from '../utils/string';

export const GLOBAL_OBJECT_EXPRESSION = [
  `typeof globalThis !== 'undefined' ? globalThis`,
  ` : typeof global !== 'undefined' ? global`,
  ` : typeof window !== 'undefined' ? window`,
  ' : this',
].join('');

export function asLiteral(value: unknown) {
  return JSON.stringify(value);
}

export function nodeEnvironment(dev: boolean) {
  return dev ? 'development' : 'production';
}

export function iife(body: string) {
  const bodyPlaceholder = '__BODY__';

  /**
   * ```
   * // foo.js
   * (function (global) {
   *   __BODY__
   * })(...);
   * ```
   */
  const iife = dedent`
  (function (global) {
  ${bodyPlaceholder}
  })(${GLOBAL_OBJECT_EXPRESSION});
  `;

  return iife.replace(bodyPlaceholder, indent(body, 1, '\t')).trim();
}
