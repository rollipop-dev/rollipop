const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const register = require('../dist/register.cjs');

function fixture(t, version, sdkVersion = '58.0.17') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const expo = path.join(root, 'node_modules/expo');
  const cli = path.join(expo, 'node_modules/@expo/cli');
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(
    path.join(expo, 'package.json'),
    JSON.stringify({ name: 'expo', version: sdkVersion }),
  );
  for (const file of ['src/winter/index.ts', 'build/winter/index.js']) {
    fs.mkdirSync(path.dirname(path.join(expo, file)), { recursive: true });
    fs.writeFileSync(path.join(expo, file), '');
  }
  fs.writeFileSync(path.join(cli, 'package.json'), JSON.stringify({ name: '@expo/cli', version }));
  return { root, cli };
}

for (const version of ['54.0.28', '55.0.31', '59.0.0']) {
  void test(`rejects incompatible CLI ${version} before loading or patching its server`, (t) => {
    const { root } = fixture(t, version);
    assert.throws(() => register(root), /SDK 55[–-]58.*matching @expo\/cli/);
  });
}

void test('rejects a compatible CLI version when its private server contract changes', (t) => {
  const { root, cli } = fixture(t, '58.1.14');
  const directory = path.join(cli, 'build/src/start/server/metro');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'MetroBundlerDevServer.js'),
    'exports.MetroBundlerDevServer = class {};',
  );
  assert.throws(
    () => register(root),
    /unsupported @expo\/cli 58\.1\.14; missing startImplementationAsync/,
  );
});

for (const [sdkVersion, cliVersion] of [
  ['55.0.32', '55.0.37'],
  ['56.0.24', '56.1.27'],
  ['57.0.31', '57.0.32'],
  ['58.0.19', '58.1.15'],
]) {
  void test(`SDK ${sdkVersion} registration is idempotent and delegates projects that did not opt in`, async (t) => {
    const { root, cli } = fixture(t, cliVersion, sdkVersion);
    const server = path.join(cli, 'build/src/start/server/metro/MetroBundlerDevServer.js');
    fs.mkdirSync(path.dirname(server), { recursive: true });
    fs.writeFileSync(
      server,
      `exports.MetroBundlerDevServer = class {
    startImplementationAsync() { return 'original start'; }
    nativeExportBundleAsync() { return 'original export'; }
    initUrlCreator() {}
    getManifestMiddlewareAsync() {}
    getUrlCreator() {}
    watchEnvironmentVariables() { return 'original watch'; }
    waitForTypeScriptAsync() { return 'original typescript'; }
  };`,
    );
    const updates = path.join(cli, 'build/src/expoUpdatesExports.js');
    fs.writeFileSync(
      updates,
      `exports.createMetroServerAndBundleRequestAsync = () => 'original updates';
exports.exportEmbedAssetsAsync = () => 'original assets';`,
    );
    for (const file of [
      path.join(cli, 'internal/unstable-expo-updates-exports.js'),
      path.join(root, 'node_modules/expo/internal/unstable-expo-updates-cli-exports.js'),
    ]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'module.exports = {};');
    }
    register(root);
    const { MetroBundlerDevServer } = require(server);
    const prototype = MetroBundlerDevServer.prototype;
    const patched = prototype.startImplementationAsync;
    register(root);
    assert.equal(prototype.startImplementationAsync, patched);
    assert.equal(prototype[Symbol.for('@rollipop/expo')].size, 1);
    const enabled = new MetroBundlerDevServer();
    enabled.projectRoot = root;
    assert.equal(await enabled.waitForTypeScriptAsync(), false);
    await assert.rejects(
      enabled.nativeExportBundleAsync({ extra: { router: { apiRoutes: true } } }, {}),
      /API route servers/,
    );
    const other = new MetroBundlerDevServer();
    other.projectRoot = path.join(root, 'other');
    assert.equal(await other.startImplementationAsync(), 'original start');
    assert.equal(await other.nativeExportBundleAsync(), 'original export');
    assert.equal(other.watchEnvironmentVariables(), 'original watch');
    assert.equal(
      await require(updates).createMetroServerAndBundleRequestAsync(other.projectRoot),
      'original updates',
    );
  });
}
