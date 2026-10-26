import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'rollipop';
import { exactRegex, id, include } from 'rollipop/filter';

import type { ExpoCompatibility } from './compatibility';
import { CONSTANTS_MODULE, loadClassicHermesConstants } from './compatibility/constants';
import type { RollipopAPI } from './types';

const ASSET_RESOLVER =
  /[/\\]expo-asset[/\\](?:build[/\\]resolveAssetSource\.native\.js|src[/\\]resolveAssetSource\.native\.ts)$/;

export default function createExpoCompatPlugins(
  compatibility: ExpoCompatibility,
  runtimeTarget: 'hermes' | 'hermes-v1',
) {
  const projectRequire = createRequire(path.join(compatibility.projectRoot, 'package.json'));
  const expoRoot = path.dirname(projectRequire.resolve('expo/package.json'));
  const expoHmrPath = path.join(expoRoot, 'src/async-require/hmr.ts');
  const nativeRoot = path.dirname(projectRequire.resolve('react-native/package.json'));
  const nativeHmrPath = path.join(nativeRoot, 'Libraries/Utilities/HMRClient.js');

  return [
    {
      name: '@rollipop/expo:initialization',
      config: {
        // Expo normally installs these through its Metro serializer before the entry.
        polyfills: [{ type: 'plain', path: path.join(expoRoot, 'virtual/streams.js') }],
        prelude: [compatibility.winterEntry],
      },
    },
    {
      name: '@rollipop/expo:hmr',
      load: {
        filter: [include(id(exactRegex(expoHmrPath)))],
        handler() {
          // Expo's Metro HMR protocol differs from Rollipop's. Share Rollipop's native client for Expo's async loader too.
          return `export { default } from ${JSON.stringify(nativeHmrPath)};`;
        },
      },
    },
    {
      name: '@rollipop/expo:asset-resolver',
      load: {
        filter: [include(id(ASSET_RESOLVER))],
        handler(filename) {
          // Keep Expo's native resolver (which delegates to RN). Metro permits Asset.fx's optional named import; Rolldown requires the export to exist.
          return (
            fs.readFileSync(filename, 'utf8') +
            `
import { Image as RollipopImage } from 'react-native';
export const setCustomSourceTransformer = RollipopImage.resolveAssetSource.setCustomSourceTransformer;
`
          );
        },
      },
    },
    ...(runtimeTarget === 'hermes'
      ? [
          {
            name: '@rollipop/expo:classic-hermes-constants',
            load: {
              filter: [include(id(CONSTANTS_MODULE))],
              handler: loadClassicHermesConstants,
            },
          },
        ]
      : []),
  ] satisfies Plugin[];
}

// HMR disables graph tree shaking. Match Expo's Babel platform folding before dependency scanning so native LogBox never pulls its web-only CSS/DOM overlay.
export function createExpoLogBoxPlugin(api: RollipopAPI, platform: string): Plugin {
  return {
    name: '@rollipop/expo:log-box-platform',
    transform: {
      filter: [
        include(
          id(
            /[/\\]@expo[/\\]log-box[/\\](?:src|build)[/\\](?:index\.(?:js|tsx)|Data[/\\]LogBoxData\.(?:js|tsx))$/,
          ),
        ),
      ],
      handler(code, filename) {
        const transformed = api.rolldownExperimental.transformSync(filename, code, {
          define: { 'process.env.EXPO_OS': JSON.stringify(platform) },
          sourcemap: true,
        });
        if (transformed.errors.length) this.error(transformed.errors[0]);
        const result = api.rolldownExperimental.minifySync(filename, transformed.code, {
          mangle: false,
          compress: {
            target: 'es2015',
            unused: false,
            keepNames: { function: true, class: true },
            joinVars: false,
            sequences: false,
          },
          codegen: { removeWhitespace: false },
          sourcemap: true,
          inputMap: transformed.map,
        });
        if (result.errors.length) this.error(result.errors[0]);
        return { code: result.code, map: result.map };
      },
    },
  };
}
