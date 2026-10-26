const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { default: createWorkletsConfig } = require('../dist/worklets.cjs');

function project(t, packages = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-worklets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), '{}');
  for (const [name, version] of Object.entries(packages)) {
    const location = path.join(directory, 'node_modules', name);
    fs.mkdirSync(location, { recursive: true });
    fs.writeFileSync(path.join(location, 'package.json'), JSON.stringify({ name, version }));
  }
  return directory;
}

void test('apps without Worklets keep the native transform disabled', (t) => {
  assert.deepEqual(createWorkletsConfig(project(t)), {});
});

void test('Worklets 0.13 closures can be serialized and executed without Babel', async (t) => {
  const directory = project(t, {
    'react-native-worklets': '0.13.0',
    'react-native-reanimated': '4.7.1',
  });
  assert.ok(createWorkletsConfig(directory).experimental.worklets);
  const { rolldownExperimental } = await import('rollipop');
  const transformer = new rolldownExperimental.RollipopReactNativeTransformer({
    envName: 'production',
    runtimeTarget: 'hermes-v1',
    worklets: { pluginVersion: '0.13.0', isRelease: true },
    swc: { module: { type: 'commonjs' } },
  });
  const source =
    "const captured = 40; export const add = (n) => { 'worklet'; return captured + n; };";
  const result = transformer.transformSync(path.join(directory, 'probe.js'), source);
  const exports = {};
  vm.runInNewContext(result.code, { exports });
  assert.equal(exports.add(2), 42);
  assert.equal(typeof exports.add.__workletHash, 'number');
  const worklet = vm.runInNewContext(exports.add.__initData.code);
  assert.equal(worklet.call({ __closure: exports.add.__closure }, 2), 42);
});

void test('missing Worklets gives an actionable Expo installation command', (t) => {
  assert.throws(
    () => createWorkletsConfig(project(t, { 'react-native-reanimated': '4.7.1' })),
    /npx expo install react-native-reanimated react-native-worklets/,
  );
});

void test('legacy Reanimated is rejected before producing an unusable bundle', (t) => {
  assert.throws(
    () => createWorkletsConfig(project(t, { 'react-native-reanimated': '3.19.0' })),
    /requires Reanimated 4\+/,
  );
});
