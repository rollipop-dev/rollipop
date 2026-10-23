const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const { SourceMapConsumer } = require('source-map');
const { default: makeConfig } = require('../dist/config.cjs');

void test('Expo compatibility preserves native asset and LogBox implementations', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exampleRequire = createRequire(
    path.resolve(__dirname, '../../../examples/expo-58/package.json'),
  );
  const assetRoot = path.join(root, 'node_modules/expo-asset/build');
  fs.mkdirSync(assetRoot, { recursive: true });
  for (const name of ['expo', 'react-native', 'react']) {
    fs.symlinkSync(
      path.dirname(exampleRequire.resolve(`${name}/package.json`)),
      path.join(root, 'node_modules', name),
    );
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main: 'entry.js' }));
  fs.writeFileSync(path.join(root, 'app.json'), '{}');
  fs.writeFileSync(path.join(assetRoot, 'extra.js'), 'export const preserved = "expo-export";');
  const native = path.join(root, 'native.js');
  fs.writeFileSync(
    native,
    `
function resolveAssetSource(source) { return { uri: source }; }
resolveAssetSource.setCustomSourceTransformer = (transformer) => { globalThis.transformer = transformer; };
globalThis.nativeResolver = resolveAssetSource;
export const Image = { resolveAssetSource };
`,
  );
  fs.writeFileSync(
    path.join(root, 'entry.js'),
    `
import resolveAssetSource, { setCustomSourceTransformer, preserved } from 'expo-asset/build/resolveAssetSource';
setCustomSourceTransformer('expo-transformer');
globalThis.probe = [resolveAssetSource === globalThis.nativeResolver, preserved, resolveAssetSource('asset.png').uri];
`,
  );
  const api = await import('rollipop');
  for (const [sdk, source] of [
    [
      '55–57',
      `import { Image } from 'react-native';
const resolveAssetSource = Image.resolveAssetSource;
export default resolveAssetSource;
export * from './extra';`,
    ],
    [
      '58',
      `import { Image } from 'react-native';
export default Image.resolveAssetSource;
export { preserved } from './extra';`,
    ],
  ]) {
    await t.test(`SDK ${sdk}`, async () => {
      fs.writeFileSync(path.join(assetRoot, 'resolveAssetSource.native.js'), source);
      const config = await makeConfig(api, resolveExpoCompatibility(root), 'production', {});
      config.prelude = [];
      config.polyfills = [];
      config.resolve.alias = { 'react-native': native };
      const output = await api.runBuild(config, { platform: 'ios', dev: false, cache: false });
      const context = {};
      vm.runInNewContext(output.code, context);
      assert.deepEqual(Array.from(context.probe), [true, 'expo-export', 'asset.png']);
      assert.equal(context.transformer, 'expo-transformer');
    });
  }
  await t.test(
    'native LogBox excludes web dependencies even when HMR disables tree shaking',
    async () => {
      const logBox = path.join(root, 'node_modules/@expo/log-box/build/Data');
      fs.mkdirSync(logBox, { recursive: true });
      const filename = path.join(logBox, 'LogBoxData.js');
      const source = `export function setSelectedLog() {
  if (process.env.EXPO_OS === 'web') {
    require('../web-only.css');
  }
  globalThis.probe = process.env.EXPO_OS;
}
`;
      fs.writeFileSync(filename, source);
      fs.writeFileSync(
        path.join(logBox, '../LogBox.js'),
        `
import { setSelectedLog } from './Data/LogBoxData';
export default { clearAllLogs: setSelectedLog, expoImplementation: true };
`,
      );
      fs.writeFileSync(
        path.join(root, 'entry.js'),
        `
import LogBox from '@expo/log-box/build/LogBox';
LogBox.clearAllLogs();
globalThis.preservedLogBox = LogBox.expoImplementation;
`,
      );
      for (const platform of ['ios', 'android']) {
        const config = await makeConfig(api, resolveExpoCompatibility(root), 'development', {});
        config.prelude = [];
        config.polyfills = [];
        const configure = config.rolldownOptions;
        config.rolldownOptions = async (options, context) => {
          const result = await configure(options, context);
          result.input.treeshake = false;
          return result;
        };
        const output = await api.runBuild(config, {
          platform,
          dev: true,
          cache: false,
          sourcemap: true,
        });
        const context = {};
        vm.runInNewContext(output.code, context);
        assert.equal(context.probe, platform);
        assert.equal(context.preservedLogBox, true);
        assert.doesNotMatch(output.code, /web-only\.css/);
        const consumer = await new SourceMapConsumer(output.map);
        const mappings = [];
        consumer.eachMapping((mapping) => {
          if (mapping.source?.endsWith('LogBoxData.js') && mapping.originalLine === 5)
            mappings.push(mapping);
        });
        consumer.destroy();
        assert.ok(
          mappings.length,
          'native LogBox statements retain their original source locations',
        );
      }
    },
  );
});
