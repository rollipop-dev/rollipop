const assert = require('node:assert/strict');
const fs = require('node:fs');
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
