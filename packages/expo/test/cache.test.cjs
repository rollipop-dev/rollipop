const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const test = require('node:test');
const { default: makeConfig } = require('../dist/config.cjs');

void test('persistent cache separates public environment values and development origins', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-cache-'));
  const envKey = 'EXPO_PUBLIC_ROLLIPOP_CACHE_TEST';
  const previous = process.env[envKey];
  t.after(() => {
    if (previous === undefined) delete process.env[envKey];
    else process.env[envKey] = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const exampleRequire = createRequire(
    path.resolve(__dirname, '../../../examples/expo-58/package.json'),
  );
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of ['expo', 'react-native', 'react']) {
    fs.symlinkSync(
      path.dirname(exampleRequire.resolve(`${name}/package.json`)),
      path.join(root, 'node_modules', name),
    );
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main: 'entry.js' }));
  fs.writeFileSync(
    path.join(root, 'app.json'),
    JSON.stringify({ expo: { name: 'Cache', slug: 'cache' } }),
  );
  fs.writeFileSync(
    path.join(root, 'entry.js'),
    'globalThis.probe = [process.env.EXPO_PUBLIC_ROLLIPOP_CACHE_TEST, process.env.EXPO_DEV_SERVER_ORIGIN];',
  );
  const api = await import('rollipop');
  const ids = [];
  for (const [value, origin] of [
    ['first', 'http://localhost:8098'],
    ['second', 'http://localhost:8099'],
  ]) {
    process.env[envKey] = value;
    const config = await makeConfig(api, resolveExpoCompatibility(root), 'development', {}, origin);
    config.prelude = [];
    config.polyfills = [];
    const original = config.rolldownOptions;
    config.rolldownOptions = async (options, context) => {
      const resolved = await original(options, context);
      assert.equal(resolved.output.persistentCache, true);
      return resolved;
    };
    const output = await api.runBuild(config, { platform: 'ios', dev: false, cache: true });
    const context = {};
    vm.runInNewContext(output.code, context);
    assert.deepEqual(Array.from(context.probe), [value, origin]);
    ids.push(Object.keys(context.__rollipop_meta__)[0]);
  }
  assert.notEqual(ids[0], ids[1]);
});
