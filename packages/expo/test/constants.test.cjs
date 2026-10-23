const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const test = require('node:test');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const { default: makeConfig } = require('../dist/config.cjs');

void test('native Constants survive object-rest on both Hermes targets', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-constants-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exampleRequire = createRequire(
    path.resolve(__dirname, '../../../examples/expo-58/package.json'),
  );
  fs.mkdirSync(path.join(root, 'node_modules/expo-constants/build'), { recursive: true });
  for (const name of ['expo', 'react-native', 'react']) {
    fs.symlinkSync(
      path.dirname(exampleRequire.resolve(`${name}/package.json`)),
      path.join(root, 'node_modules', name),
    );
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main: 'entry.js' }));
  fs.writeFileSync(path.join(root, 'app.json'), '{}');
  fs.writeFileSync(
    path.join(root, 'node_modules/expo-constants/build/Constants.js'),
    `const ExponentConstants = globalThis.nativeConstants;
const { name, appOwnership, ...nativeConstants } = (ExponentConstants || {});
export default { ...nativeConstants, appOwnership: appOwnership ?? null };`,
  );
  fs.writeFileSync(
    path.join(root, 'entry.js'),
    "import Constants from 'expo-constants/build/Constants'; globalThis.probe = Constants;",
  );
  const api = await import('rollipop');
  for (const useHermesV1 of [false, true]) {
    await t.test(useHermesV1 ? 'Hermes V1' : 'classic Hermes', async () => {
      const config = await makeConfig(api, resolveExpoCompatibility(root), 'production', {
        plugins: [['expo-build-properties', { useHermesV1 }]],
      });
      config.prelude = [];
      config.polyfills = [];
      const output = await api.runBuild(config, { platform: 'ios', dev: false, cache: false });
      const context = vm.createContext({});
      // Recorded Hermes HostObject behavior: descriptors/Object.keys expose keys, but propertyIsEnumerable returns false.
      vm.runInContext(
        `globalThis.nativeConstants = { name: 'ExponentConstants', appOwnership: 'expo', executionEnvironment: 'storeClient', expoVersion: '55.0.32' };
const original = Object.prototype.propertyIsEnumerable;
Object.prototype.propertyIsEnumerable = function(key) {
  return this === nativeConstants ? false : original.call(this, key);
};`,
        context,
      );
      vm.runInContext(output.code, context);
      assert.equal(context.probe.executionEnvironment, 'storeClient');
      assert.equal(context.probe.expoVersion, '55.0.32');
      assert.equal(context.probe.appOwnership, 'expo');
      assert.equal(context.probe.name, undefined);
    });
  }
});
