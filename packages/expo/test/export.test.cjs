const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createExpoAssetPlugin,
  createExportArtifactsAsync,
  enrichExpoAssetAsync,
} = require('../dist/export.cjs');

async function assetFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rollipop-assets-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const contents = ['first scale', 'duplicate scale', 'double scale'];
  const files = ['icon.png', 'icon@1x.png', 'icon@2x.png'].map((name) =>
    path.join(directory, name),
  );
  await Promise.all(files.map((file, index) => fs.writeFile(file, contents[index])));
  return {
    files,
    scales: [1, 1, 2],
    name: 'icon',
    type: 'png',
    hash: 'aggregate-rn-hash',
    httpServerLocation: '/assets/..%2Foutside',
  };
}

void test('duplicate scales retain RN lookup order and hash the bytes actually packaged', async (t) => {
  const asset = await assetFixture(t);
  const result = await enrichExpoAssetAsync(asset, { platform: 'ios', isNativeExport: true });
  assert.deepEqual(result.scales, [1, 2]);
  assert.deepEqual(result.files, [asset.files[0], asset.files[2]]);
  for (let index = 0; index < result.files.length; index++) {
    const expected = createHash('md5')
      .update(await fs.readFile(result.files[index]))
      .digest('hex');
    assert.equal(result.fileHashes[index], expected);
  }
  assert.equal(result.hash, asset.hash);
  assert.deepEqual(asset.scales, [1, 1, 2]);
});

void test('external Android assets use a valid native namespace and preserve development URLs', async (t) => {
  const asset = await assetFixture(t);
  const native = await enrichExpoAssetAsync(asset, { platform: 'android', isNativeExport: true });
  assert.match(native.httpServerLocation, /^\/assets\/[a-z][a-z0-9_]*\//);
  for (const options of [{ platform: 'android' }, { platform: 'ios', isNativeExport: true }]) {
    assert.equal(
      (await enrichExpoAssetAsync(asset, options)).httpServerLocation,
      asset.httpServerLocation,
    );
  }
});

void test('asset registry and export descriptors agree on native resource names and hashes', async (t) => {
  const asset = await assetFixture(t);
  const plugin = createExpoAssetPlugin({
    api: {
      AssetUtils: {
        resolveScaledAssets: async () => asset,
        generateAssetRegistryCode: (_registry, descriptor) => JSON.stringify(descriptor),
      },
    },
    projectRoot: path.dirname(asset.files[0]),
    platform: 'android',
    assetExtensions: ['png'],
    isNativeExport: true,
  });
  const loaded = await plugin.load.handler(asset.files[0]);
  const exported = await createExportArtifactsAsync({
    options: { platform: 'android', bytecode: false },
    code: 'var ready = true;',
    assets: [asset],
  });
  assert.deepEqual(JSON.parse(loaded.code), exported.assets[0]);
  assert.equal(await plugin.load.handler('/app/index.tsx'), null);
});

void test('platform exports use immutable names and self-consistent external source maps', async () => {
  async function build(platform, code = 'var ready = true;') {
    return createExportArtifactsAsync({
      options: { platform, bytecode: false },
      code,
      map: JSON.stringify({ version: 3, sources: ['index.ts'], names: [], mappings: '' }),
      assets: [],
    });
  }
  const ios = await build('ios');
  const repeated = await build('ios');
  const changed = await build('ios', 'var ready = false;');
  const android = await build('android');
  const [bundle, map] = ios.artifacts;
  assert.equal(bundle.filename, repeated.artifacts[0].filename);
  assert.notEqual(bundle.filename, changed.artifacts[0].filename);
  assert.notEqual(bundle.filename, android.artifacts[0].filename);
  assert.equal(JSON.parse(map.source).file, bundle.filename);
  assert.equal(map.filename, `${bundle.filename}.map`);
  assert.ok(bundle.source.endsWith(`sourceMappingURL=${path.posix.basename(map.filename)}`));
});

void test('inline maps replace stale map comments and do not emit a second map artifact', async () => {
  const result = await createExportArtifactsAsync({
    options: { platform: 'ios', bytecode: false, inlineSourceMap: true },
    code: 'var ready = true;\n//# sourceMappingURL=stale.map',
    map: JSON.stringify({ version: 3, sources: ['index.ts'], names: [], mappings: '' }),
    assets: [],
  });
  assert.equal(result.artifacts.length, 1);
  const [bundle] = result.artifacts;
  assert.ok(!bundle.source.includes('stale.map'));
  const encoded = bundle.source.split('sourceMappingURL=data:application/json;base64,')[1];
  assert.equal(JSON.parse(Buffer.from(encoded, 'base64').toString()).file, bundle.filename);
});
