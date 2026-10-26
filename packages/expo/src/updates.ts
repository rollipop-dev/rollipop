import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import type { ExpoCompatibility } from './compatibility';
import type { BuildUpdatesAssets, ExpoAsset, UpdatesBuildOptions } from './types';

const roots = new Map<string, BuildUpdatesAssets>();
const BUILD_ASSETS = Symbol('@rollipop/expo:updates-assets');
interface UpdatesServer {
  [BUILD_ASSETS]?: () => Promise<ExpoAsset[]>;
}
interface UpdatesExports {
  createMetroServerAndBundleRequestAsync(
    root: string,
    options: UpdatesBuildOptions,
  ): Promise<{
    server: UpdatesServer;
    bundleRequest: UpdatesBuildOptions;
  }>;
  exportEmbedAssetsAsync(
    server: UpdatesServer,
    request: unknown,
    root: string,
    options: unknown,
  ): Promise<ExpoAsset[]>;
}
const replacements = new Map<string, UpdatesExports>();

// expo-updates has a second, asset-only build entry that bypasses Expo's server class. Replace its public-to-Expo re-export before the native resource script imports it. Each wrapper remains scoped to projects that enabled this plugin.
export function installUpdatesExports({
  compatibility,
  buildAssetsAsync,
}: {
  compatibility: ExpoCompatibility;
  buildAssetsAsync: BuildUpdatesAssets;
}) {
  const { projectRoot, cli } = compatibility;
  roots.set(path.resolve(projectRoot), buildAssetsAsync);
  const filenames = cli.getUpdatesExportPaths();
  const cliRoot = filenames[0];
  const original: UpdatesExports = require(filenames[0]);
  for (const name of [
    'createMetroServerAndBundleRequestAsync',
    'exportEmbedAssetsAsync',
  ] as const) {
    if (typeof original[name] !== 'function') {
      throw new Error(
        `@rollipop/expo: unsupported @expo/cli ${compatibility.cliVersion}; missing ${name}`,
      );
    }
  }
  let replacement = replacements.get(cliRoot);
  if (!replacement) {
    replacement = {
      ...original,
      async createMetroServerAndBundleRequestAsync(root, options) {
        const build = roots.get(path.resolve(root));
        if (!build) return original.createMetroServerAndBundleRequestAsync(root, options);
        return {
          server: { [BUILD_ASSETS]: () => build(options), end() {} },
          bundleRequest: options,
        };
      },
      async exportEmbedAssetsAsync(server, request, root, options) {
        const build = server[BUILD_ASSETS];
        if (build) return build();
        return original.exportEmbedAssetsAsync(server, request, root, options);
      },
    };
  }
  replacements.set(cliRoot, replacement);
  for (const filename of filenames) {
    require(filename);
    require.cache[filename]!.exports = replacement;
  }
}

const BEGIN = '# @generated begin @rollipop/expo-updates';
const END = '# @generated end @rollipop/expo-updates';

export function withUpdatesPreload(config: ExpoConfig): ExpoConfig {
  const projectRoot = config._internal!.projectRoot;
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const { withDangerousMod, withAppBuildGradle }: typeof import('expo/config-plugins') =
    projectRequire('expo/config-plugins');
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const filename = path.join(mod.modRequest.platformProjectRoot, '.xcode.env');
      const previous = await fs.readFile(filename, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const clean = previous.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`, 'g'), '').trimEnd();
      const generated = [
        BEGIN,
        `ROLLIPOP_EXPO_UPDATES_PRELOAD="$("$NODE_BINARY" --print "require.resolve('@rollipop/expo/updates-preload.cjs')")"`,
        'export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require \\"$ROLLIPOP_EXPO_UPDATES_PRELOAD\\""',
        END,
      ].join('\n');
      await fs.writeFile(filename, `${clean}\n${generated}\n`);
      return mod;
    },
  ]);
  return withAppBuildGradle(config, (mod) => {
    const begin = '// @generated begin @rollipop/expo-updates';
    const end = '// @generated end @rollipop/expo-updates';
    const clean = mod.modResults.contents.replace(
      new RegExp(`${begin}[\\s\\S]*?${end}\\n?`, 'g'),
      '',
    );
    const generated = [
      begin,
      `def rollipopExpoUpdatesPreload = (nodeExecutableAndArgs.get() + ["--print", "require.resolve('@rollipop/expo/updates-preload.cjs')"]).execute(null, rootDir).text.trim()`,
      'nodeExecutableAndArgs.set(nodeExecutableAndArgs.get() + ["--require", rollipopExpoUpdatesPreload])',
      end,
    ]
      .map((line) => `    ${line}`)
      .join('\n');
    mod.modResults.contents = clean.replace(/react\s*\{/, (match) => `${match}\n${generated}`);
    return mod;
  });
}
