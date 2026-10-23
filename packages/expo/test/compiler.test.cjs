const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const test = require('node:test');
const path = require('node:path');
const { SourceMapConsumer } = require('source-map');
const { default: makeConfig } = require('../dist/config.cjs');

const filename = '/project/components/CompilerProbe.tsx';
const source = `export function CompilerProbe({ value }: { value: number }) {
  const doubled = value * 2;
  return <probe value={doubled} />;
}`;

async function transform(code = source, compiler = {}) {
  const api = await import('rollipop');
  const root = path.resolve(__dirname, '../../../examples/expo-58');
  const config = await makeConfig(api, resolveExpoCompatibility(root), 'production', {
    experiments: { reactCompiler: true },
  });
  const { rolldownExperimental } = api;
  const transformer = new rolldownExperimental.RollipopReactNativeTransformer({
    envName: 'production',
    runtimeTarget: 'hermes-v1',
    worklets: { pluginVersion: '0.13.0', isRelease: true },
    swc: {
      react: { runtime: 'Automatic', compiler: { ...config.transform.jsx.compiler, ...compiler } },
    },
  });
  return transformer.transformSync(filename, code);
}

void test('native compiler memoizes a component before lexical bindings are lowered', async () => {
  const result = await transform();
  assert.match(result.code, /react\/compiler-runtime/);
  assert.match(result.code, /\$\[0\]/);
  assert.match(result.code, /var doubled/);
  const consumer = await new SourceMapConsumer(result.map);
  const lines = new Set();
  consumer.eachMapping((mapping) => lines.add(mapping.originalLine));
  consumer.destroy();
  assert.ok(lines.has(2), 'component body retains its source location');
  assert.ok(lines.has(3), 'JSX return retains its source location');
  assert.ok([...lines].every((line) => line >= 1 && line <= source.split('\n').length));
});

for (const directive of ['worklet', 'use no memo']) {
  void test(`native compiler honors the ${directive} directive`, async () => {
    const result = await transform(
      source.replace('  const doubled', `  '${directive}';\n  const doubled`),
    );
    assert.doesNotMatch(result.code, /compiler-runtime/);
  });
}

void test('native compiler honors application include and exclude patterns', async () => {
  assert.doesNotMatch(
    (await transform(source, { exclude: [/CompilerProbe/] })).code,
    /compiler-runtime/,
  );
  assert.doesNotMatch(
    (await transform(source, { include: [/OtherComponent/] })).code,
    /compiler-runtime/,
  );
});
