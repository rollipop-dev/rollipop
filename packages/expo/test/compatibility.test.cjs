const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const { resolveRuntimeTarget } = require('../dist/compatibility/runtime.cjs');

function project(t, sdkVersion = '58.0.19', cliVersion = '58.1.15') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-compat-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const expo = path.join(root, 'node_modules/expo');
  const cli = path.join(expo, 'node_modules/@expo/cli');
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(
    path.join(expo, 'package.json'),
    JSON.stringify({ name: 'expo', version: sdkVersion }),
  );
  fs.writeFileSync(
    path.join(cli, 'package.json'),
    JSON.stringify({ name: '@expo/cli', version: cliVersion }),
  );
  for (const filename of ['src/winter/index.ts', 'build/winter/index.js']) {
    fs.mkdirSync(path.dirname(path.join(expo, filename)), { recursive: true });
    fs.writeFileSync(path.join(expo, filename), '');
  }
  return { root, expo, cli };
}

for (const [sdk, cli, entry, target] of [
  ['55.0.32', '55.0.37', 'src/winter/index.ts', 'hermes'],
  ['56.0.24', '56.1.27', 'src/winter/index.ts', 'hermes-v1'],
  ['57.0.31', '57.0.32', 'src/winter/index.ts', 'hermes-v1'],
  ['58.0.19', '58.1.15', 'build/winter/index.js', 'hermes-v1'],
]) {
  void test(`SDK ${sdk} selects its initialization entry and Hermes default`, (t) => {
    const { root, expo } = project(t, sdk, cli);
    const compatibility = resolveExpoCompatibility(root);
    assert.equal(compatibility.winterEntry, fs.realpathSync(path.join(expo, entry)));
    assert.equal(resolveRuntimeTarget(compatibility, {}), target);
  });
}

for (const [sdk, cli] of [
  ['54.0.38', '54.0.28'],
  ['59.0.0', '59.0.0'],
  ['58.0.19', '57.0.32'],
]) {
  void test(`rejects unsupported SDK/CLI pair ${sdk}/${cli} before loading private APIs`, (t) => {
    const { root } = project(t, sdk, cli);
    assert.throws(() => resolveExpoCompatibility(root), /SDK 55[–-]58.*matching @expo\/cli/);
  });
}

void test('accepts patch and minor CLI updates within the matching SDK major', (t) => {
  for (const cli of ['58.1.13', '58.2.0']) {
    assert.equal(resolveExpoCompatibility(project(t, '58.0.19', cli).root).cliVersion, cli);
  }
});

void test('reports a changed private helper with its CLI version and export name', (t) => {
  const { root, cli } = project(t);
  const file = path.join(cli, 'build/src/start/server/metro/router.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'exports.renamed = () => {};');
  const compatibility = resolveExpoCompatibility(root);
  assert.throws(
    () => compatibility.cli.getRouterDirectoryModuleIdWithManifest(root, {}),
    /unsupported @expo\/cli 58\.1\.15.*getRouterDirectoryModuleIdWithManifest/,
  );
});

void test('Expo build properties can opt SDK 55 into Hermes V1 or opt newer SDKs out', (t) => {
  const legacy = resolveExpoCompatibility(project(t, '55.0.32', '55.0.37').root);
  const modern = resolveExpoCompatibility(project(t).root);
  assert.equal(
    resolveRuntimeTarget(legacy, { plugins: [['expo-build-properties', { useHermesV1: true }]] }),
    'hermes-v1',
  );
  assert.equal(
    resolveRuntimeTarget(modern, {
      plugins: [['expo-build-properties', { ios: { useHermesV1: false } }]],
    }),
    'hermes',
  );
});

void test('mixed platform engine settings use syntax compatible with both native runtimes', (t) => {
  const compatibility = resolveExpoCompatibility(project(t).root);
  assert.equal(
    resolveRuntimeTarget(compatibility, {
      plugins: [
        ['expo-build-properties', { ios: { useHermesV1: true }, android: { useHermesV1: false } }],
      ],
    }),
    'hermes',
  );
});

void test('native project settings override plugin defaults and honor explicit false', (t) => {
  const { root } = project(t);
  fs.mkdirSync(path.join(root, 'ios'));
  fs.mkdirSync(path.join(root, 'android'));
  fs.writeFileSync(
    path.join(root, 'ios/Podfile.properties.json'),
    JSON.stringify({ 'expo.useHermesV1': 'false' }),
  );
  fs.writeFileSync(path.join(root, 'android/gradle.properties'), 'hermesV1Enabled=true\n');
  const compatibility = resolveExpoCompatibility(root);
  assert.equal(
    resolveRuntimeTarget(compatibility, {
      plugins: [['expo-build-properties', { useHermesV1: true }]],
    }),
    'hermes',
  );
});

void test('native build environment overrides generated project properties', (t) => {
  const { root } = project(t, '55.0.32', '55.0.37');
  const keys = ['RCT_HERMES_V1_ENABLED', 'ORG_GRADLE_PROJECT_hermesV1Enabled'];
  for (const key of keys) {
    const previous = process.env[key];
    t.after(() =>
      previous === undefined ? delete process.env[key] : (process.env[key] = previous),
    );
    process.env[key] = 'true';
  }
  assert.equal(resolveRuntimeTarget(resolveExpoCompatibility(root), {}), 'hermes-v1');
});
