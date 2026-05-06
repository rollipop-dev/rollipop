import { dedent } from './_dedent';

export function generateShareScopeCode() {
  return dedent`
    export { loadRemote, loadShare, loadShareSync } from '@module-federation/runtime';
  `;
}
