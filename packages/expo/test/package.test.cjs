const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

void test('compiled public entries preserve synchronous CommonJS and default ESM imports', async () => {
  const register = require('@rollipop/expo');
  const plugin = require('@rollipop/expo/app.plugin.js');
  assert.equal(typeof register, 'function');
  assert.equal(typeof plugin, 'function');
  assert.equal((await import('@rollipop/expo')).default, register);
  assert.equal(require('../app.plugin.js'), plugin);
  assert.equal(require('../dist/app.plugin.cjs'), plugin);
  assert.equal(
    require.resolve('@rollipop/expo/updates-preload.cjs'),
    path.resolve(__dirname, '../dist/updates-preload.cjs'),
  );
  require('@rollipop/expo/updates-preload.cjs');
});

void test('public type declarations are emitted with the CommonJS build', () => {
  const { exports } = require('../package.json');
  for (const entry of ['.', './app.plugin.js']) {
    const declaration = fs.readFileSync(
      path.resolve(__dirname, '..', exports[entry].types),
      'utf8',
    );
    assert.match(declaration, /export = /);
  }
});

void test('missing Rollipop is diagnosed before loading the adapter or patching Expo', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-missing-peer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = path.join(root, 'node_modules/@rollipop/expo');
  fs.mkdirSync(adapter, { recursive: true });
  for (const file of ['dist', 'package.json', 'app.plugin.js']) {
    fs.cpSync(path.resolve(__dirname, '..', file), path.join(adapter, file), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const { version } = require('../package.json');
  const run = (code) =>
    spawnSync(process.execPath, ['-e', code], {
      cwd: root,
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      encoding: 'utf8',
    });
  for (const [entry, code] of [
    ['register', "require('@rollipop/expo')(process.cwd())"],
    [
      'config plugin',
      "require('@rollipop/expo/app.plugin.js')({ _internal: { projectRoot: process.cwd() } })",
    ],
    [
      'Updates preload',
      "process.argv = ['node', '/expo-updates/scripts/createUpdatesResources.js', 'ios', process.cwd()]; require('@rollipop/expo/updates-preload.cjs')",
    ],
  ]) {
    await t.test(entry, () => {
      const result = run(code);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Missing peer dependency "rollipop"/);
      assert.ok(result.stderr.includes(root));
      assert.ok(result.stderr.includes(`yarn add -D rollipop@${version}`));
      assert.ok(result.stderr.includes(`npm install --save-dev rollipop@${version}`));
      assert.ok(result.stderr.includes(`pnpm add -D rollipop@${version}`));
      assert.match(result.stderr, /restart Expo CLI/);
    });
  }
  await t.test('importing without activation stays inert', () => {
    const result = run(
      "require('@rollipop/expo'); require('@rollipop/expo/app.plugin.js'); require('@rollipop/expo/updates-preload.cjs')",
    );
    assert.equal(result.status, 0, result.stderr);
  });
  await t.test('other missing dependencies retain their original errors', () => {
    const core = path.join(root, 'node_modules/rollipop');
    fs.mkdirSync(core);
    fs.writeFileSync(path.join(core, 'package.json'), '{"name":"rollipop"}');
    const result = run("require('@rollipop/expo')(process.cwd())");
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /Missing peer dependency "rollipop"/);
    assert.match(result.stderr, /Cannot find module 'semver'/);
  });
});
