import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

async function main() {
  process.env.NODE_ENV = 'development';
  const { AssetUtils, createDevServer, loadConfig } = await import('rollipop');
  const appDir = path.resolve('packages/app');
  const config = await loadConfig({ cwd: appDir, mode: 'development' });
  config.entry = path.resolve(config.root, config.entry);
  const assetPath = createRequire(import.meta.url).resolve('pnp-asset-package');
  const asset = await AssetUtils.resolveScaledAssets({
    projectRoot: config.root,
    assetPath,
    platform: 'ios',
    preferNativePlatform: config.resolve.preferNativePlatform,
  });

  const devServer = await createDevServer(config, { host: '127.0.0.1', port: 0 });

  try {
    const assetResponse = await devServer.instance.inject({
      method: 'GET',
      url: `${asset.httpServerLocation}/icon.png?platform=ios&hash=${asset.hash}`,
    });

    if (assetResponse.statusCode !== 200) {
      throw new Error(`Asset request failed with status ${assetResponse.statusCode}`);
    }

    fs.writeFileSync(
      'dev-server-result.json',
      JSON.stringify({
        success: true,
        assetPath,
        assetLocation: asset.httpServerLocation,
        assetStatus: assetResponse.statusCode,
        assetBase64: assetResponse.rawPayload.toString('base64'),
      }),
    );
  } finally {
    await devServer.instance.close();
  }
}

main().catch((err) => {
  console.error(err);
  fs.writeFileSync(
    'dev-server-result.json',
    JSON.stringify({
      success: false,
      error: err.message,
      stack: err.stack,
    }),
  );
  process.exit(1);
});
