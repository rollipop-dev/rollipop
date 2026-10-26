import path from 'node:path';

import type { AssetUtils } from 'rollipop';

import { resolveExpoCompatibility, type ExpoCompatibility } from './compatibility';
import type { ExpoDevServer } from './compatibility/cli';
import makeConfig from './config';
import { createExportArtifactsAsync } from './export';
import createExpoInspector from './inspector';
import { configureNativeRouter } from './router';
import { installUpdatesExports } from './updates';

const PATCH = Symbol.for('@rollipop/expo');

type CloseCallback = (error?: Error | null) => void;

/**
 * Register the Expo CLI adapter synchronously for one project in the current Node process.
 * Use the Expo config plugin to also configure native Expo Updates build scripts.
 */
export default function register(projectRoot: string): void {
  const compatibility = resolveExpoCompatibility(projectRoot);
  const { projectRoot: root, expoRequire } = compatibility;
  const prototype = compatibility.cli.getServerPrototype() as ExpoDevServer & {
    [PATCH]?: Map<string, ExpoCompatibility>;
  };
  const installUpdates = () =>
    installUpdatesExports({
      compatibility,
      async buildAssetsAsync(options) {
        const { exp } = expoRequire('@expo/config').getConfig(root);
        const { convertEntryPointToRelative, resolveEntryPoint } =
          expoRequire('@expo/config/paths');
        const output = await prototype.nativeExportBundleAsync.call(
          { projectRoot: root },
          exp,
          {
            platform: options.platform,
            mainModuleName: convertEntryPointToRelative(
              root,
              options.entryFile ?? resolveEntryPoint(root),
            ),
            mode: options.dev ? 'development' : 'production',
            minify: false,
            bytecode: false,
            serializerIncludeMaps: false,
          },
          new Map(),
        );
        return output.assets;
      },
    });
  const registeredRoots = prototype[PATCH];
  if (registeredRoots) {
    registeredRoots.set(root, compatibility);
    installUpdates();
    return;
  }
  const roots = new Map([[root, compatibility]]);
  Object.defineProperty(prototype, PATCH, { value: roots });
  const enabled = (server: { projectRoot: string }) => roots.has(path.resolve(server.projectRoot));

  const start = prototype.startImplementationAsync;
  prototype.startImplementationAsync = async function (options) {
    const compatibility = roots.get(path.resolve(this.projectRoot));
    if (!compatibility) return start.call(this, options);
    const { expoRequire } = compatibility;
    const { getConfig } = expoRequire('@expo/config');
    const { exp } = getConfig(this.projectRoot);
    configureNativeRouter(exp);
    if (options.location.hostType === 'tunnel') {
      throw new Error('@rollipop/expo does not support tunnel URLs; use --lan or --localhost');
    }
    const api = await import('rollipop');
    if (options.resetDevServer) await api.resetCache();
    await this.initUrlCreator(options);
    const origin = this.getUrlCreator().constructUrl({ scheme: 'http' });
    const host = new URL(origin).hostname;
    if (options.isExporting) {
      // Preserve Expo's server lifecycle and URL contract without opening a listener or creating a Metro graph for exports.
      return {
        server: { close: (done?: CloseCallback) => done?.(), addListener() {} },
        location: { port: options.port, host, url: origin, protocol: 'http' },
        middleware: {},
        messageSocket: { broadcast() {} },
      };
    }
    const manifest = await this.getManifestMiddlewareAsync(options);
    const config = await makeConfig(api, compatibility, options.mode ?? 'development', exp, origin);
    config.plugins!.push({
      name: '@rollipop/expo:manifest',
      configureServer(server) {
        server.middlewares.use(manifest.getHandler());
      },
    });
    const server = await api.createDevServer(config, {
      host,
      port: options.port,
      inspector: createExpoInspector(compatibility, origin),
    });
    // Rewrite before Fastify selects a route (Connect middleware runs too late).
    server.instance.server.prependListener('request', (request) => {
      const url = new URL(request.url!, origin);
      const extension = path.extname(url.pathname);
      if (!url.pathname.startsWith('/hot/') && (extension === '.bundle' || extension === '.map')) {
        request.url = `/index${extension}${url.search}`;
      }
    });
    // Native stack frames still refer to Expo's original, possibly nested URL.
    server.instance.addHook<{ Body: { stack?: { file: string }[] } }>(
      'preValidation',
      (request, _reply, done) => {
        if (request.url.startsWith('/symbolicate') && Array.isArray(request.body?.stack)) {
          for (const frame of request.body.stack) {
            const url = URL.parse(frame.file);
            if (url && !url.pathname.startsWith('/hot/') && url.pathname.endsWith('.bundle')) {
              url.pathname = '/index.bundle';
              frame.file = url.href;
            }
          }
        }
        done();
      },
    );
    try {
      await server.instance.listen({ host, port: options.port });
    } catch (error) {
      await server.instance.close();
      throw error;
    }
    process.env.EXPO_DEV_SERVER_ORIGIN = origin;
    console.log(`[@rollipop/expo] Rollipop listening at ${origin}`);
    return {
      // Expo's stopAsync must close Fastify too, to dispose watchers and sockets.
      server: {
        close: (done?: CloseCallback) => server.instance.close().then(() => done?.(), done),
      },
      location: { port: options.port, host, url: origin, protocol: 'http' },
      middleware: server.middlewares,
      messageSocket: { broadcast: server.message.broadcast },
    };
  };

  for (const method of ['watchEnvironmentVariables', 'waitForTypeScriptAsync'] as const) {
    const original = prototype[method];
    prototype[method] = function (...args) {
      return enabled(this) ? Promise.resolve(false) : original.apply(this, args);
    };
  }

  const nativeExport = prototype.nativeExportBundleAsync;
  prototype.nativeExportBundleAsync = async function (exp, options, files, extra = {}) {
    const compatibility = roots.get(path.resolve(this.projectRoot));
    if (!compatibility) return nativeExport.call(this, exp, options, files, extra);
    const { expoRequire } = compatibility;
    configureNativeRouter(exp);
    if (!['ios', 'android'].includes(options.platform)) {
      throw new Error(
        '@rollipop/expo supports iOS and Android; use expo export --platform ios --platform android',
      );
    }
    const api = await import('rollipop');
    const config = await makeConfig(api, compatibility, options.mode, exp);
    const { getMetroServerRoot } = expoRequire('@expo/config/paths');
    config.entry = path.resolve(getMetroServerRoot(this.projectRoot), options.mainModuleName);
    const assets: AssetUtils.AssetData[] = [];
    config.plugins!.push({
      name: '@rollipop/expo:export-assets',
      async generateBundle() {
        for (const id of this.getModuleIds()) {
          if (config.resolve.assetExtensions.includes(path.extname(id).slice(1))) {
            assets.push(
              await api.AssetUtils.resolveScaledAssets({
                projectRoot: config.root,
                assetPath: id,
                platform: options.platform,
                preferNativePlatform: true,
              }),
            );
          }
        }
      },
    });
    const output = await api.runBuild(config, {
      platform: options.platform,
      dev: options.mode !== 'production',
      minify: options.minify,
      sourcemap: !!options.serializerIncludeMaps,
    });
    console.log(`[@rollipop/expo] Rollipop built ${options.platform} (${options.mode})`);
    return createExportArtifactsAsync({
      compatibility,
      options,
      extra,
      code: output.code,
      map: output.map,
      assets,
    });
  };
  installUpdates();
}
