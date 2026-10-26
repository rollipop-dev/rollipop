const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { it } = require('node:test');
const { SourceMapConsumer } = require('source-map');
const { default: makeConfig } = require('../dist/config.cjs');

// oxc_sourcemap loses the last mapped source coordinates when concatenating a map ending in an unmapped token.
// Worklets exposes this upstream bug: CompilerProbe's original body line 4 becomes 1004 in the final bundle map.
// Keep the correct source-location assertions; enable this regression once the published engine includes a fix.
// https://github.com/oxc-project/oxc-sourcemap/pull/471 (closed without merging)
void it.skip('preserves component body source locations with Worklets and React Compiler', async () => {
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
  const bodyLines = new Set();
  await SourceMapConsumer.with(output.map.toString(), null, (consumer) => {
    consumer.eachMapping((mapping) => {
      if (mapping.source?.endsWith('components/CompilerProbe.tsx'))
        bodyLines.add(mapping.originalLine);
    });
  });
  assert.ok(
    bodyLines.has(4),
    `Expected original body line 4; received ${[...bodyLines].join(',')}`,
  );
  assert.ok(bodyLines.has(5), 'The JSX must map to original line 5');
  assert.ok([...bodyLines].every((line) => line >= 1 && line <= 6));
});
