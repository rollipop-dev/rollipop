import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const { loadConfig } = await import('rollipop');
  const { Bundler } = await import('rollipop');

  const config = await loadConfig({ cwd: process.cwd(), mode: 'production' });
  config.entry = path.resolve(config.root, config.entry);

  const bundler = new Bundler(config);
  const chunk = await bundler.build({ platform: 'ios', dev: false, cache: false });

  fs.writeFileSync(
    'build-result.json',
    JSON.stringify({
      success: true,
      codeLength: chunk.code.length,
      // User code
      hasAppRegistry: chunk.code.includes('AppRegistry'),
      // Default prelude (InitializeCore from react-native)
      hasInitializeCore: chunk.code.includes('InitializeCore'),
      // Built-in defines & global variables
      hasDevFalse: chunk.code.includes('var __DEV__ = false'),
      hasBundleStartTime: chunk.code.includes('__BUNDLE_START_TIME__'),
      hasNodeEnv: chunk.code.includes('process.env.NODE_ENV'),
      // Default React Native polyfills
      hasReactNativePolyfill: chunk.code.includes('ErrorUtils'),
    }),
  );
}

main().catch((err) => {
  fs.writeFileSync(
    'build-result.json',
    JSON.stringify({
      success: false,
      error: err.message,
      stack: err.stack,
    }),
  );
  process.exit(1);
});
