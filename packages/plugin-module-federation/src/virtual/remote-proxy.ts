import { REMOTE_CACHE_GLOBAL } from '../constants';
import { dedent } from './_dedent';

export interface RemoteProxyOptions {
  /**
   * Federation request id, e.g. 'remote_app' or 'remote_app/RemoteNavigator'.
   */
  remoteId: string;
  /**
   * Inject a React-aware Proxy that forces a re-render via hooks when the
   * underlying remote module is hot-swapped. Disable in production builds
   * where HMR notifications never fire.
   */
  reactAware: boolean;
}

export function generateRemoteProxyCode({ remoteId, reactAware }: RemoteProxyOptions) {
  const idLiteral = JSON.stringify(remoteId);

  if (reactAware) {
    return dedent`
      import * as __mfReact from 'react';

      const __cache = globalThis.${REMOTE_CACHE_GLOBAL};
      const __id = ${idLiteral};

      function __ensureLoaded() {
        if (__cache.modules[__id] !== undefined) {
          return null;
        }
        return __cache.load(__id);
      }

      function __getMod() {
        return __cache.modules[__id];
      }

      function __FederatedProxy(props) {
        const mod = __getMod();
        if (mod === undefined) {
          throw __ensureLoaded();
        }
        const fn = mod.default ?? mod;
        return __mfReact.createElement(fn, props);
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
          if (mod === undefined) {
            throw __ensureLoaded();
          }
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

  return dedent`
    const __cache = globalThis.${REMOTE_CACHE_GLOBAL};
    const __id = ${idLiteral};

    function __getMod() {
      if (__cache.modules[__id] !== undefined) {
        return __cache.modules[__id];
      }
      throw __cache.load(__id);
    }

    function __invoke(...args) {
      const mod = __getMod();
      const fn = mod.default ?? mod;
      return fn.apply(this, args);
    }

    const __proxy = new Proxy(__invoke, {
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
