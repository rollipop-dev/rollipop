import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AssetUtils, Plugin } from 'rollipop';
import { id, include } from 'rollipop/filter';

import type { ExpoCompatibility } from './compatibility';
import compileHermesAsync from './hermes';
import type {
  ExpoAsset,
  NativeExportExtra,
  NativeExportOptions,
  NativeExportResult,
  RollipopAPI,
} from './types';

const md5 = (value: string | Buffer) => createHash('md5').update(value).digest('hex');

// Expo Asset and EAS Update identify each scale variant by its own content hash. RN's aggregate `hash` is still needed for the dev-server asset URL.
export async function enrichExpoAssetAsync(
  asset: AssetUtils.AssetData,
  { platform, isNativeExport = false }: { platform?: string; isNativeExport?: boolean } = {},
): Promise<ExpoAsset> {
  // Some packages ship both name.png and name@1x.png with different contents. Expo copies both scale-1 files to the same native resource path. Keep the first file, matching RN's scale lookup and the dimensions resolved from it.
  const indices = asset.scales
    .map((scale, index) => (asset.scales.indexOf(scale) === index ? index : -1))
    .filter((index) => index !== -1);
  const files = indices.map((index) => asset.files[index]);
  return {
    ...asset,
    // Encoded ../ segments in external asset paths otherwise produce Android identifiers beginning "2f", which AAPT rejects. Keep dev-server URLs intact.
    httpServerLocation:
      platform === 'android' && isNativeExport && asset.httpServerLocation.startsWith('/assets/..')
        ? `/assets/rollipop/${asset.httpServerLocation.slice('/assets/'.length)}`
        : asset.httpServerLocation,
    files,
    scales: indices.map((index) => asset.scales[index]),
    fileHashes: await Promise.all(files.map(async (file) => md5(await fs.readFile(file)))),
  };
}

export function createExpoAssetPlugin({
  api,
  projectRoot,
  platform,
  assetExtensions,
  assetRegistryPath = 'react-native/asset-registry',
  isNativeExport = false,
}: {
  api: Pick<RollipopAPI, 'AssetUtils'>;
  projectRoot: string;
  platform: string;
  assetExtensions: string[];
  assetRegistryPath?: string;
  isNativeExport?: boolean;
}) {
  return {
    name: '@rollipop/expo:asset-hashes',
    load: {
      order: 'pre',
      filter: [include(id(new RegExp(`\\.(?:${assetExtensions.join('|')})$`)))],
      async handler(id) {
        if (!assetExtensions.includes(path.extname(id).slice(1))) return null;
        const asset = await api.AssetUtils.resolveScaledAssets({
          projectRoot,
          assetPath: id,
          platform,
          preferNativePlatform: true,
        });
        return {
          code: api.AssetUtils.generateAssetRegistryCode(
            assetRegistryPath,
            await enrichExpoAssetAsync(asset, { platform, isNativeExport }),
          ),
          moduleType: 'js',
        };
      },
    },
  } satisfies Plugin;
}

export async function createExportArtifactsAsync({
  compatibility,
  options,
  extra = {},
  code,
  map,
  assets,
}: {
  compatibility: ExpoCompatibility;
  options: NativeExportOptions;
  extra?: NativeExportExtra;
  code: string;
  map?: { toString(): string } | null;
  assets: AssetUtils.AssetData[];
}): Promise<NativeExportResult> {
  // Platform directories prevent simultaneous iOS/Android exports overwriting each other. Content hashes give EAS Update immutable launch-asset names.
  const hash = md5(code);
  const extension = options.bytecode ? 'hbc' : 'js';
  const filename = `_expo/static/js/${options.platform}/index-${hash}.${extension}`;
  const mapFilename = `${filename}.map`;
  let source: string | Buffer = code.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  let sourceMap: { file?: string; [key: string]: unknown } | null = map
    ? JSON.parse(map.toString())
    : null;
  if (sourceMap) sourceMap.file = filename;
  if (sourceMap && !options.inlineSourceMap) {
    source += `\n//# sourceMappingURL=${extra.sourceMapUrl ?? path.posix.basename(mapFilename)}`;
  }
  if (options.bytecode) {
    const result = await compileHermesAsync({
      compatibility,
      projectRoot: compatibility.projectRoot,
      code: source,
      map: sourceMap ? JSON.stringify(sourceMap) : null,
      filename: options.mainModuleName,
      minify: options.minify ?? options.mode === 'production',
    });
    source = result.hbc;
    sourceMap = result.sourcemap ? JSON.parse(result.sourcemap) : null;
    if (sourceMap) sourceMap.file = filename;
  } else if (sourceMap && options.inlineSourceMap) {
    source += `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(sourceMap)).toString('base64')}`;
  }

  const artifacts: NativeExportResult['artifacts'] = [
    { type: 'js', filename, source, metadata: {} },
  ];
  if (sourceMap && !options.inlineSourceMap) {
    artifacts.push({
      type: 'map',
      filename: mapFilename,
      source: JSON.stringify(sourceMap),
      metadata: {},
    });
  }
  return {
    artifacts,
    assets: await Promise.all(
      assets.map((asset) =>
        enrichExpoAssetAsync(asset, {
          platform: options.platform,
          isNativeExport: true,
        }),
      ),
    ),
  };
}
