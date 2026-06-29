/**
 * **NOTE**: Type definitions are ported from `metro` implementation.
 *
 * @see https://github.com/facebook/metro/blob/0.81.x/packages/metro/src/Assets.js
 */

import fs from 'node:fs';
import path from 'node:path';

import { isNotNil } from 'es-toolkit';
import { imageSize } from 'image-size';

import { IMAGE_EXTENSIONS } from '../constants';
import { DEV_SERVER_ASSET_PATH } from '../server';
import { md5 } from '../utils/hash';

export interface AssetContext {
  platform: string;
  preferNativePlatform: boolean;
}

export interface AssetInfo {
  files: string[];
  hash: string;
  name: string;
  scales: number[];
  type: string;
}

export interface AssetDataWithoutFiles {
  __packager_asset: boolean;
  fileSystemLocation: string;
  hash: string;
  httpServerLocation: string;
  name: string;
  scales: AssetScale[];
  type: string;
  width?: number;
  height?: number;
}

export interface AssetDataFiltered {
  __packager_asset: boolean;
  hash: string;
  httpServerLocation: string;
  name: string;
  scales: AssetScale[];
  type: string;
  width?: number;
  height?: number;
}

export interface AssetData extends AssetDataWithoutFiles {
  id: string;
  files: string[];
}

export type AssetScale = number;

const SCALE_PATTERN = '@(\\d+\\.?\\d*)x';
const ASSET_BASE_NAME_PATTERN = /(.+?)(@([\d.]+)x)?$/;
const PLATFORM_FILE_PATH_PATTERN = /^(.+?)(\.([^.]+))?\.([^.]+)$/;
const IMAGE_ASSET_TYPES = new Set(IMAGE_EXTENSIONS);

/**
 * key: platform,
 * value: allowed scales
 *
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/community-cli-plugin/src/commands/bundle/filterPlatformAssetScales.js#L11
 */
const ALLOW_SCALES: Partial<Record<string, number[]>> = {
  ios: [1, 2, 3],
};

/**
 * @see https://developer.android.com/training/multiscreen/screendensities#TaskProvideAltBmp
 */
const ANDROID_ASSET_QUALIFIER: Record<number, string> = {
  0.75: 'ldpi',
  1: 'mdpi',
  1.5: 'hdpi',
  2: 'xhdpi',
  3: 'xxhdpi',
  4: 'xxxhdpi',
} as const;

interface ParsedAssetPath {
  assetName: string;
  name: string;
  platform?: string;
  resolution: number;
  type: string;
}

interface AssetRecord {
  files: string[];
  scales: AssetScale[];
}

interface ResolveScaledAssetsOptions {
  projectRoot: string;
  assetPath: string;
  platform: string;
  preferNativePlatform: boolean;
}

export async function resolveScaledAssets(options: ResolveScaledAssetsOptions): Promise<AssetData> {
  const { projectRoot, assetPath, platform, preferNativePlatform } = options;
  const context = { platform, preferNativePlatform };
  const { name, type } = parseAssetPath(path.basename(assetPath), context);
  const relativePath = path.relative(projectRoot, assetPath);
  const { files, scales } = getAbsoluteAssetRecord(assetPath, context);
  const fileData = await Promise.all(files.map((file) => fs.promises.readFile(file)));
  const hash = md5(Buffer.concat(fileData));
  const firstScale = scales[0] ?? 1;
  const dimensions = IMAGE_ASSET_TYPES.has(type) ? imageSize(fileData[0]) : undefined;

  return {
    __packager_asset: true,
    id: assetPath,
    name,
    type,
    width: dimensions?.width == null ? undefined : dimensions.width / firstScale,
    height: dimensions?.height == null ? undefined : dimensions.height / firstScale,
    files,
    scales,
    fileSystemLocation: path.dirname(assetPath),
    httpServerLocation: getHttpServerLocation(relativePath),
    hash,
  };
}

function getHttpServerLocation(relativePath: string): string {
  const dirname = path.dirname(relativePath);
  const serverLocation = relativePath.startsWith('..')
    ? `/${DEV_SERVER_ASSET_PATH}/${dirname}`
    : path.join('/', DEV_SERVER_ASSET_PATH, dirname);

  return normalizePathSeparatorsToPosix(serverLocation);
}

function normalizePathSeparatorsToPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getAssetPlatforms(context: AssetContext): string[] {
  return [context.platform, context.preferNativePlatform ? 'native' : null].filter(isNotNil);
}

function parseBaseName(baseName: string) {
  const match = ASSET_BASE_NAME_PATTERN.exec(baseName);
  if (match == null) {
    throw new Error(`invalid asset name: ${baseName}`);
  }

  const [, rootName, , resolution] = match;
  if (resolution != null) {
    const parsedResolution = Number.parseFloat(resolution);
    if (!Number.isNaN(parsedResolution)) {
      return { resolution: parsedResolution, rootName };
    }
  }

  return { resolution: 1, rootName };
}

function tryParseAssetPath(filePath: string, context: AssetContext): ParsedAssetPath | null {
  const dirname = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const match = PLATFORM_FILE_PATH_PATTERN.exec(fileName);

  if (match == null) {
    return null;
  }

  const [, baseName, , platformCandidate, extension] = match;
  const platforms = new Set(getAssetPlatforms(context));
  const platform =
    platformCandidate != null && platforms.has(platformCandidate) ? platformCandidate : undefined;
  const { resolution, rootName } = parseBaseName(
    platform == null && platformCandidate != null ? `${baseName}.${platformCandidate}` : baseName,
  );

  return {
    assetName: path.join(dirname, `${rootName}.${extension}`),
    name: rootName,
    platform,
    resolution,
    type: extension,
  };
}

function parseAssetPath(filePath: string, context: AssetContext): ParsedAssetPath {
  const assetPath = tryParseAssetPath(filePath, context);
  if (assetPath == null) {
    throw new Error(`invalid asset file path: ${filePath}`);
  }

  return assetPath;
}

function getAssetKey(assetName: string, platform?: string) {
  return platform == null ? assetName : `${assetName} : ${platform}`;
}

function buildAssetMap(
  dirname: string,
  files: string[],
  context: AssetContext,
): Map<string, AssetRecord> {
  const assetMap = new Map<string, AssetRecord>();

  for (const file of files) {
    const asset = tryParseAssetPath(file, context);
    if (asset == null) {
      continue;
    }

    const assetKey = getAssetKey(asset.assetName, asset.platform);
    let record = assetMap.get(assetKey);
    if (record == null) {
      record = { files: [], scales: [] };
      assetMap.set(assetKey, record);
    }

    let insertIndex = 0;
    while (insertIndex < record.scales.length && asset.resolution >= record.scales[insertIndex]) {
      insertIndex += 1;
    }

    record.scales.splice(insertIndex, 0, asset.resolution);
    record.files.splice(insertIndex, 0, path.join(dirname, file));
  }

  return assetMap;
}

function getAbsoluteAssetRecord(assetPath: string, context: AssetContext): AssetRecord {
  const dirname = path.dirname(assetPath);
  const files = fs.readdirSync(dirname) as string[];
  const asset = parseAssetPath(path.basename(assetPath), context);
  const assetMap = buildAssetMap(dirname, files, context);

  const platformRecord = assetMap.get(getAssetKey(asset.assetName, context.platform));
  if (platformRecord != null) {
    return platformRecord;
  }

  if (context.preferNativePlatform) {
    const nativeRecord = assetMap.get(getAssetKey(asset.assetName, 'native'));
    if (nativeRecord != null) {
      return nativeRecord;
    }
  }

  const defaultRecord = assetMap.get(asset.assetName);
  if (defaultRecord != null) {
    return defaultRecord;
  }

  throw new Error(`Asset not found: ${assetPath} for platform: ${context.platform}`);
}

export function platformSuffixPattern(context: AssetContext) {
  return [context.platform, context.preferNativePlatform ? 'native' : null]
    .filter(isNotNil)
    .map((platform) => `.${platform}`)
    .join('|');
}

export function stripSuffix(assetPath: string, context: AssetContext) {
  const basename = path.basename(assetPath);
  const extension = path.extname(assetPath);
  const suffixPattern = platformSuffixPattern(context);
  return basename.replace(new RegExp(`(${SCALE_PATTERN})?(?:${suffixPattern})?${extension}$`), '');
}

export function getAssetPriority(assetPath: string, context: AssetContext) {
  const suffixPattern = platformSuffixPattern(context);
  if (new RegExp(`${SCALE_PATTERN}(?:${suffixPattern})`).test(assetPath)) {
    return 3;
  } else if (new RegExp(`(?:${suffixPattern})`).test(assetPath)) {
    return 2;
  } else if (new RegExp(`${SCALE_PATTERN}`).test(assetPath)) {
    return 1;
  }
  return 0;
}

interface AddSuffixOptions {
  scale?: AssetScale;
  platform?: string;
}

function addSuffix(assetPath: string, context: AssetContext, options: AddSuffixOptions) {
  const extension = path.extname(assetPath);
  return stripSuffix(assetPath, context)
    .concat(options?.scale ? `@${options.scale}x` : '')
    .concat(options?.platform ? `.${options.platform}${extension}` : extension);
}

interface GetSuffixedPathOptions {
  scale?: AssetScale;
  platform?: string;
}

/**
 * add suffix to asset path
 *
 * ```js
 * // assetPath input
 * '/path/to/assets/image.png'
 *
 * // `platform` suffixed
 * '/path/to/assets/image.android.png'
 *
 * // `scale` suffixed
 * '/path/to/assets/image@1x.png'
 *
 * // both `platform` and `scale` suffixed
 * '/path/to/assets/image@1x.android.png'
 * ```
 */
export function getSuffixedPath(
  assetPath: string,
  context: AssetContext,
  options: GetSuffixedPathOptions,
) {
  // if `scale` present, append scale suffix to path
  // assetPath: '/path/to/assets/image.png'
  // result:
  //   '/path/to/assets/image.png'
  //   '/path/to/assets/image.{platform}.png'
  //   '/path/to/assets/image@{scale}x.png'
  //   '/path/to/assets/image@{scale}x.{platform}.png'
  // strip exist suffixes and add new options based suffixes
  const suffixedBasename = addSuffix(assetPath, context, {
    scale: options?.scale,
    platform: options?.platform,
  });
  const dirname = path.dirname(assetPath);

  return path.join(dirname, suffixedBasename);
}

export function resolveAssetPath(
  assetPath: string,
  context: AssetContext,
  scale?: AssetScale,
): string {
  const requestedScale = scale ?? parseAssetPath(path.basename(assetPath), context).resolution;
  const record = getAbsoluteAssetRecord(assetPath, context);

  for (let index = 0; index < record.scales.length; index += 1) {
    if (record.scales[index] >= requestedScale) {
      return record.files[index];
    }
  }

  const fallback = record.files.at(-1);
  if (fallback != null) {
    return fallback;
  }

  throw new Error(`cannot resolve asset path for ${assetPath}`);
}

interface CopyAssetsToDestinationOptions {
  assets: AssetData[];
  assetsDir: string;
  platform: string;
  preferNativePlatform: boolean;
}

/**
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/community-cli-plugin/src/commands/bundle/assetPathUtils.js
 */
export async function copyAssetsToDestination(options: CopyAssetsToDestinationOptions) {
  const { assets, platform, assetsDir } = options;

  const mkdirWithAssertPath = (targetPath: string) => {
    const dirname = path.dirname(targetPath);
    fs.mkdirSync(dirname, { recursive: true });
  };

  return Promise.all(
    assets.map((asset): Promise<void> => {
      const validScales = new Set(filterPlatformAssetScales(platform, asset.scales));
      return Promise.all(
        asset.scales.map(async (scale, index) => {
          if (!validScales.has(scale)) {
            return;
          }

          if (platform !== 'android') {
            const from = asset.files[index];
            const to = path.join(assetsDir, getIosAssetDestinationPath(asset, scale));
            mkdirWithAssertPath(to);
            return fs.copyFileSync(from, to);
          }

          const from = asset.files[index];
          const to = path.join(assetsDir, getAndroidAssetDestinationPath(asset, scale));
          mkdirWithAssertPath(to);
          fs.copyFileSync(from, to);
        }),
      ).then(() => void 0);
    }),
  ).then(() => void 0);
}

export function filterPlatformAssetScales(
  platform: string,
  scales: readonly AssetScale[],
): AssetScale[] {
  const allowlist = ALLOW_SCALES[platform];
  if (allowlist == null) {
    return [...scales];
  }

  const filteredScales = scales.filter((scale) => allowlist.includes(scale));
  if (filteredScales.length > 0 || scales.length === 0) {
    return filteredScales;
  }

  const maxAllowedScale = allowlist[allowlist.length - 1];
  const largerScale = scales.find((scale) => scale > maxAllowedScale);
  return [largerScale ?? scales[scales.length - 1]];
}

/**
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/community-cli-plugin/src/commands/bundle/getAssetDestPathIOS.js
 */
function getIosAssetDestinationPath(asset: AssetData, scale: AssetScale): string {
  const suffix = scale === 1 ? '' : `@${scale}x`;
  const fileName = `${asset.name + suffix}.${asset.type}`;
  const devServerBasePath =
    asset.httpServerLocation.at(0) === '/'
      ? asset.httpServerLocation.slice(1)
      : asset.httpServerLocation;

  return path.join(devServerBasePath.replace(/\.\.\//g, '_'), fileName);
}

function getAndroidAssetDestinationPath(asset: AssetData, scale: number) {
  const assetQualifierSuffix = ANDROID_ASSET_QUALIFIER[scale];
  const devServerBasePath =
    asset.httpServerLocation.at(0) === '/'
      ? asset.httpServerLocation.slice(1)
      : asset.httpServerLocation;

  const assetName = `${devServerBasePath}/${asset.name}`
    .toLowerCase()
    .replace(/\//g, '_')
    .replace(/(?:[^a-z0-9_])/g, '')
    .replace(/^assets_/, '');

  if (!assetQualifierSuffix) {
    throw new Error(`invalid asset qualifier: ${asset.id}`);
  }

  return path.join(
    isDrawable(asset.type) ? `drawable-${assetQualifierSuffix}` : 'raw',
    `${assetName}.${asset.type}`,
  );
}

/**
 * @see https://developer.android.com/guide/topics/resources/drawable-resource
 */
function isDrawable(type: string) {
  return ['gif', 'heic', 'heif', 'jpeg', 'jpg', 'ktx', 'png', 'webp', 'xml'].includes(type);
}

export function generateAssetRegistryCode(assetRegistryPath: string, asset: AssetData) {
  const {
    files: _files,
    fileSystemLocation: _fileSystemLocation,
    id: _id,
    ...registryAsset
  } = asset;
  return `module.exports = require('${assetRegistryPath}').registerAsset(${JSON.stringify(registryAsset)});`;
}
