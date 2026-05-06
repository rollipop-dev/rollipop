import { PLUGIN_NAME, SHARED_REGISTRY_GLOBAL } from '../constants';
import { dedent, Q } from './_dedent';

export interface RemoteEntryGenerationOptions {
  name: string;
  exposes: Record<string, string>;
}

export function generateRemoteEntryCode(options: RemoteEntryGenerationOptions) {
  const exposeEntries = Object.entries(options.exposes);

  const importLines = exposeEntries
    .map(([, filePath], index) => `import * as __expose_${index} from ${JSON.stringify(filePath)};`)
    .join('\n');

  const moduleMapLines = exposeEntries
    .map(([key], index) => `  ${JSON.stringify(key)}: () => __expose_${index},`)
    .join('\n');

  return dedent`
    ${importLines}

    const moduleMap = {
    ${moduleMapLines}
    };

    const container = {
      init() {},
      async get(path) {
        const factory = moduleMap[path];
        if (factory == null) {
          throw new Error('[${PLUGIN_NAME}] Module ${Q}' + path + '${Q} is not exposed by ${Q}${options.name}${Q}');
        }
        return factory;
      },
    };

    globalThis[${JSON.stringify(options.name)}] = container;
    globalThis.${SHARED_REGISTRY_GLOBAL} = globalThis.${SHARED_REGISTRY_GLOBAL} || {};
  `;
}
