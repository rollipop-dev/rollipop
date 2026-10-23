import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'rollipop';
import { exactRegex, id, include } from 'rollipop/filter';

import type { ExpoCompatibility } from './compatibility';
import { CONSTANTS_MODULE, loadClassicHermesConstants } from './compatibility/constants';

const LOG_BOX_ENTRY =
  /[/\\]@expo[/\\]log-box[/\\](?:lib\.ts|build[/\\]index\.js|src[/\\]index\.tsx)$/;
const LOG_BOX = /[/\\]@expo[/\\]log-box[/\\](?:src[/\\]LogBox\.ts|build[/\\]LogBox\.js)$/;
const ASSET_RESOLVER =
  /[/\\]expo-asset[/\\](?:build[/\\]resolveAssetSource\.native\.js|src[/\\]resolveAssetSource\.native\.ts)$/;

export default function createExpoCompatPlugin(
  compatibility: ExpoCompatibility,
  runtimeTarget: 'hermes' | 'hermes-v1',
) {
  const projectRequire = createRequire(path.join(compatibility.projectRoot, 'package.json'));
  const expoRoot = path.dirname(projectRequire.resolve('expo/package.json'));
  const expoHmrPath = path.join(expoRoot, 'src/async-require/hmr.ts');
  const nativeRoot = path.dirname(projectRequire.resolve('react-native/package.json'));
  const nativeHmrPath = path.join(nativeRoot, 'Libraries/Utilities/HMRClient.js');
  const nativeLogBoxPath = path.join(nativeRoot, 'Libraries/LogBox/LogBox.js');

  return {
    name: '@rollipop/expo:compat',
    config: {
      // Expo normally installs these through its Metro serializer before the entry.
      polyfills: [{ type: 'plain', path: path.join(expoRoot, 'virtual/streams.js') }],
      prelude: [compatibility.winterEntry],
    },
    load: {
      filter: [
        include(id(exactRegex(expoHmrPath))),
        include(id(LOG_BOX_ENTRY)),
        include(id(LOG_BOX)),
        include(id(ASSET_RESOLVER)),
        ...(runtimeTarget === 'hermes' ? [include(id(CONSTANTS_MODULE))] : []),
      ],
      handler(id) {
        if (runtimeTarget === 'hermes' && CONSTANTS_MODULE.test(id)) {
          return loadClassicHermesConstants(id);
        }

        if (id === expoHmrPath) {
          // Expo's async loader must register with the same HMR client as native RN. Rollipop already replaces this RN module with its own HMR transport.
          return `export { default } from ${JSON.stringify(nativeHmrPath)};`;
        }

        if (LOG_BOX_ENTRY.test(id)) {
          // Expo's DOM/CSS overlay needs its Metro DOM transformer. Native RN's existing LogBox keeps warnings and exception diagnostics available.
          return `import LogBox from ${JSON.stringify(nativeLogBoxPath)};
export function setupLogBox() { LogBox.install(); }`;
        }

        if (LOG_BOX.test(id)) {
          return `export { default } from ${JSON.stringify(nativeLogBoxPath)};`;
        }

        if (ASSET_RESOLVER.test(id)) {
          // Expo's native resolver exposes its setter on the default export; its shared asset initializer also imports the setter by name.
          return `import { Image } from 'react-native';
const resolveAssetSource = Image.resolveAssetSource;
export default resolveAssetSource;
export const setCustomSourceTransformer = resolveAssetSource.setCustomSourceTransformer;`;
        }
      },
    },
  } satisfies Plugin;
}
