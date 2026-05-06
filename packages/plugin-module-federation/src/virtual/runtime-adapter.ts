import { PLUGIN_NAME, SCRIPT_LOADER_GLOBAL } from '../constants';
import { dedent, Q } from './_dedent';

export function generateRuntimeAdapterCode() {
  return dedent`
    const adapter = {
      name: 'rollipop-script-loader-adapter',
      async loadEntry({ remoteInfo }) {
        const loader = globalThis.${SCRIPT_LOADER_GLOBAL};
        if (loader == null) {
          throw new Error(
            '[${PLUGIN_NAME}] ${Q}globalThis.${SCRIPT_LOADER_GLOBAL}${Q} is not registered. Provide ${Q}runtime.implement${Q} in plugin config.'
          );
        }
        await loader.loadScript({
          scriptId: remoteInfo.name,
          url: remoteInfo.entry,
        });
        const container = globalThis[remoteInfo.entryGlobalName];
        if (container == null) {
          throw new Error(
            '[${PLUGIN_NAME}] Remote container ${Q}' + remoteInfo.entryGlobalName + '${Q} was not registered after script load.'
          );
        }
        return container;
      },
    };

    export default adapter;
  `;
}
