import { PLUGIN_NAME, SHARED_REGISTRY_GLOBAL } from '../constants';
import { dedent, Q } from './_dedent';

export function generateSharedShimCode(sharedName: string) {
  const key = JSON.stringify(sharedName);
  return dedent`
    const __mod = globalThis.${SHARED_REGISTRY_GLOBAL} && globalThis.${SHARED_REGISTRY_GLOBAL}[${key}];
    if (__mod == null) {
      throw new Error('[${PLUGIN_NAME}] shared module ${Q}${sharedName}${Q} is not registered on the host. Add it to the host config${Q}s ${Q}shared${Q} field.');
    }
    module.exports = __mod;
  `;
}
