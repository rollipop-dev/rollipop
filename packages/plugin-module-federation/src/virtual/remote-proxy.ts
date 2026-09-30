import { REMOTE_CACHE_GLOBAL } from '../constants';
import { dedent } from './_dedent';

export interface RemoteProxyOptions {
  /**
   * Federation request id, e.g. 'remote_app' or 'remote_app/RemoteNavigator'.
   */
  remoteId: string;
}

export function generateRemoteProxyCode({ remoteId }: RemoteProxyOptions) {
  const idLiteral = JSON.stringify(remoteId);

  return dedent`
    import * as __mfReact from 'react';

    const __cache = globalThis.${REMOTE_CACHE_GLOBAL};
    const __id = ${idLiteral};

    function __getMod() {
      if (__cache.modules[__id] !== undefined) {
        return __cache.modules[__id];
      }
      throw __cache.load(__id);
    }

    function __FederatedProxy(props) {
      const mod = __getMod();
      return __mfReact.createElement(mod.default ?? mod, props);
    }

    const __proxy = new Proxy(__FederatedProxy, {
      get(target, prop) {
        if (prop === '__esModule') {
          return true;
        }
        if (prop === 'then') {
          return undefined;
        }
        const mod = __getMod();
        if (prop in mod) {
          return mod[prop];
        }
        if (mod.default != null && prop in mod.default) {
          return mod.default[prop];
        }
        return target[prop];
      },
    });

    export default __proxy;
  `;
}
