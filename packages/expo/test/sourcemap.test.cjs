const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { it } = require('node:test');
const { SourceMapConsumer } = require('source-map');
const { default: makeConfig } = require('../dist/config.cjs');

// Look up generated tokens in the serialized map to exercise the module concat and VLQ encoding path.
void it('preserves component body source locations with Worklets and React Compiler', async () => {
  const projectRoot = path.resolve(__dirname, '../../../examples/expo-58');
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  const { expo: exp } = appRequire('./app.json');
  const api = await import('rollipop');
  const config = await makeConfig(api, resolveExpoCompatibility(projectRoot), 'production', exp);
  const output = await api.runBuild(config, {
    platform: 'ios',
    dev: false,
    minify: false,
    sourcemap: true,
    cache: false,
  });
  const componentStart = output.code.indexOf('function CompilerProbe(');
  assert.notEqual(componentStart, -1, 'Expected the bundled CompilerProbe component');
  assert.ok(output.map);
  await SourceMapConsumer.with(output.map.toString(), null, (consumer) => {
    for (const [token, line, column] of [
      ['value * 2', 4, 18],
      ['"react-compiler-result"', 5, 22],
    ]) {
      const offset = output.code.indexOf(token, componentStart);
      assert.notEqual(offset, -1, `Expected generated token ${token}`);
      const prefix = output.code.slice(0, offset);
      const original = consumer.originalPositionFor({
        line: prefix.split('\n').length,
        column: offset - prefix.lastIndexOf('\n') - 1,
      });
      assert.deepEqual(
        { source: original.source, line: original.line, column: original.column },
        { source: 'components/CompilerProbe.tsx', line, column },
        `Incorrect source location for ${token}`,
      );
    }
  });
});
