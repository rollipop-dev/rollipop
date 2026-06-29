import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { md5 } from '../../utils/hash';
import {
  copyAssetsToDestination,
  filterPlatformAssetScales,
  generateAssetRegistryCode,
  resolveAssetPath,
  resolveScaledAssets,
  type AssetData,
} from '../assets';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('resolveAssetPath', () => {
  it('prefers platform assets over generic assets', async () => {
    const { dir, assetPath } = await createAssetFixture({
      'icon.svg': svg(10, 10),
      'icon.ios.svg': svg(11, 11),
    });

    expect(
      resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: false }),
    ).toBe(path.join(dir, 'icon.ios.svg'));
  });

  it('falls back to native assets before generic assets when enabled', async () => {
    const { dir, assetPath } = await createAssetFixture({
      'icon.svg': svg(10, 10),
      'icon.native.svg': svg(11, 11),
    });

    expect(resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: true })).toBe(
      path.join(dir, 'icon.native.svg'),
    );
  });

  it('ignores native assets when native platform preference is disabled', async () => {
    const { dir, assetPath } = await createAssetFixture({
      'icon.svg': svg(10, 10),
      'icon.native.svg': svg(11, 11),
    });

    expect(resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: false })).toBe(
      path.join(dir, 'icon.svg'),
    );
  });

  it('selects the closest larger scale from the requested asset path', async () => {
    const { dir, assetPath } = await createAssetFixture(
      {
        'icon@1x.svg': svg(10, 10),
        'icon@2x.svg': svg(20, 20),
        'icon@4x.svg': svg(40, 40),
      },
      'icon@3x.svg',
    );

    expect(resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: false })).toBe(
      path.join(dir, 'icon@4x.svg'),
    );
  });

  it('falls back to the largest scale when the requested scale is larger than every asset', async () => {
    const { dir, assetPath } = await createAssetFixture(
      {
        'icon@1x.svg': svg(10, 10),
        'icon@2x.svg': svg(20, 20),
      },
      'icon@3x.svg',
    );

    expect(resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: false })).toBe(
      path.join(dir, 'icon@2x.svg'),
    );
  });

  it('serves platform-specific scaled assets for scaled requests', async () => {
    const { dir, assetPath } = await createAssetFixture(
      {
        'icon@2x.svg': svg(20, 20),
        'icon@2x.ios.svg': svg(22, 22),
      },
      'icon@2x.svg',
    );

    expect(resolveAssetPath(assetPath, { platform: 'ios', preferNativePlatform: false })).toBe(
      path.join(dir, 'icon@2x.ios.svg'),
    );
  });
});

describe('resolveScaledAssets', () => {
  it('returns asset metadata from actual platform image variants', async () => {
    const ios2x = svg(40, 20);
    const ios4x = svg(80, 40);
    const { dir, root, assetPath } = await createAssetFixture({
      'icon.svg': svg(10, 5),
      'icon@2x.ios.svg': ios2x,
      'icon@4x.ios.svg': ios4x,
    });

    const asset = await resolveScaledAssets({
      projectRoot: root,
      assetPath,
      platform: 'ios',
      preferNativePlatform: false,
    });

    expect(asset).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        fileSystemLocation: dir,
        files: [path.join(dir, 'icon@2x.ios.svg'), path.join(dir, 'icon@4x.ios.svg')],
        hash: md5(Buffer.concat([Buffer.from(ios2x), Buffer.from(ios4x)])),
        height: 10,
        httpServerLocation: '/assets/imgs',
        name: 'icon',
        scales: [2, 4],
        type: 'svg',
        width: 20,
      }),
    );
  });

  it('returns non-image assets without dimensions', async () => {
    const { root, assetPath } = await createAssetFixture(
      {
        'FontAwesome.ttf': 'font-data',
      },
      'FontAwesome.ttf',
    );

    const asset = await resolveScaledAssets({
      projectRoot: root,
      assetPath,
      platform: 'ios',
      preferNativePlatform: false,
    });

    expect(asset).toEqual(
      expect.objectContaining({
        files: [assetPath],
        height: undefined,
        scales: [1],
        type: 'ttf',
        width: undefined,
      }),
    );
  });
});

describe('filterPlatformAssetScales', () => {
  it('keeps only iOS-supported scales when possible', () => {
    expect(filterPlatformAssetScales('ios', [1, 1.5, 2, 3, 4])).toEqual([1, 2, 3]);
  });

  it('keeps the closest larger scale for iOS when no scale is allowlisted', () => {
    expect(filterPlatformAssetScales('ios', [0.5, 4, 100])).toEqual([4]);
    expect(filterPlatformAssetScales('ios', [0.5])).toEqual([0.5]);
  });

  it('keeps every scale for non-iOS platforms', () => {
    expect(filterPlatformAssetScales('android', [1, 1.5, 2, 3.7])).toEqual([1, 1.5, 2, 3.7]);
  });
});

describe('copyAssetsToDestination', () => {
  it('copies only filtered iOS scales from resolved asset files', async () => {
    const { root, assetPath } = await createAssetFixture({
      'icon@0.5x.svg': svg(5, 5),
      'icon@4x.svg': svg(40, 40),
      'icon@100x.svg': svg(1000, 1000),
    });
    const assetsDir = await createTempRoot('rollipop-assets-dest-');
    const asset = await resolveScaledAssets({
      projectRoot: root,
      assetPath,
      platform: 'ios',
      preferNativePlatform: false,
    });

    await copyAssetsToDestination({
      assets: [asset],
      assetsDir,
      platform: 'ios',
      preferNativePlatform: false,
    });

    await expect(fs.access(path.join(assetsDir, 'assets/imgs/icon@4x.svg'))).resolves.toBe(
      undefined,
    );
    await expect(fs.access(path.join(assetsDir, 'assets/imgs/icon@0.5x.svg'))).rejects.toThrow();
    await expect(fs.access(path.join(assetsDir, 'assets/imgs/icon@100x.svg'))).rejects.toThrow();
  });
});

describe('generateAssetRegistryCode', () => {
  it('filters file-system-only metadata from the registered asset', () => {
    const asset: AssetData = {
      __packager_asset: true,
      fileSystemLocation: '/root/imgs',
      files: ['/root/imgs/icon.svg'],
      hash: 'hash',
      height: 10,
      httpServerLocation: '/assets/imgs',
      id: '/root/imgs/icon.svg',
      name: 'icon',
      scales: [1],
      type: 'svg',
      width: 10,
    };

    const code = generateAssetRegistryCode('AssetRegistry', asset);

    expect(code).toContain("require('AssetRegistry').registerAsset");
    expect(code).toContain('"httpServerLocation":"/assets/imgs"');
    expect(code).not.toContain('fileSystemLocation');
    expect(code).not.toContain('files');
    expect(code).not.toContain('"id"');
  });
});

async function createAssetFixture(files: Record<string, string>, requestFile = 'icon.svg') {
  const root = await createTempRoot('rollipop-assets-');
  const dir = path.join(root, 'imgs');
  await fs.mkdir(dir, { recursive: true });

  await Promise.all(
    Object.entries(files).map(([file, content]) => fs.writeFile(path.join(dir, file), content)),
  );

  return {
    dir,
    root,
    assetPath: path.join(dir, requestFile),
  };
}

async function createTempRoot(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function svg(width: number, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
}
