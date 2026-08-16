import fs from 'node:fs';
import path from 'node:path';

import fp from 'fastify-plugin';

import type { DevServerContext } from '../types';

/**
 * Expo Dev Client manifest endpoint.
 *
 * The Expo Dev Client (and classic Expo Go) fetch the project manifest as JSON
 * from the dev server. Metro/Expo serve it at `/`, `/manifest` and
 * `/index.exp`. Rollipop's dev server previously had no such route, so the
 * native runtime did `new JSONObject("<!DOCTYPE html>...")` and failed with
 * `Error loading app: Value <!DOCTYPE ... cannot be converted to JSONObject`.
 *
 * This middleware serves a minimal but valid Expo manifest JSON (the same shape
 * Metro produces) at `/manifest` and `/index.exp`, so the Dev Client can
 * resolve `bundleUrl` and load the Rollipop-bundled JS. `/` is left to the
 * dashboard / rest handlers (HTML for browsers, JSON config for tooling).
 */
export interface ExpoManifestPluginOptions {
  context: DevServerContext;
}

function readJsonSafe<T = any>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function parseRuntimePlatform(request: { headers: Record<string, any>; query?: any }): string {
  const query = request.query as Record<string, any> | undefined;
  const platform =
    query?.platform ?? request.headers['expo-platform'] ?? request.headers['exponent-platform'];
  if (typeof platform === 'string') return platform;
  if (Array.isArray(platform) && platform.length > 0) return String(platform[0]);

  const userAgent = request.headers['user-agent'];
  if (typeof userAgent === 'string') {
    if (/Android/i.test(userAgent)) return 'android';
    if (/iPhone|iPad/i.test(userAgent)) return 'ios';
  }
  return 'android';
}

function buildManifest(
  context: DevServerContext,
  request: { headers: Record<string, any>; query?: any },
) {
  const root = context.config.root ?? process.cwd();
  const appJson = readJsonSafe<{ expo?: Record<string, any> }>(path.join(root, 'app.json'));
  const pkgJson = readJsonSafe<Record<string, any>>(path.join(root, 'package.json'));
  const expo = appJson?.expo ?? {};

  const platform = parseRuntimePlatform(request);

  // Prefer the host the client actually reached us on (e.g. the LAN IP the
  // Dev Client discovered via mDNS, or 10.0.2.2 from an emulator). The
  // server's `serverBaseUrl` may use `0.0.0.0`, which the device cannot route
  // to, so a bundleUrl built from it would be unreachable.
  const incomingHost = request.headers['host'];
  const baseUrl = incomingHost
    ? `http://${Array.isArray(incomingHost) ? incomingHost[0] : incomingHost}`
    : context.serverBaseUrl;
  const baseHost = new URL(baseUrl).host;

  const bundleUrl = `${baseUrl}/index.bundle?platform=${platform}&dev=true&lazy=true&minify=false`;

  const dependencies: Record<string, string> = {
    ...pkgJson?.dependencies,
    ...pkgJson?.devDependencies,
  };

  const id = `@example/${expo.slug ?? expo.name ?? 'rollipop-expo-example'}`;

  return {
    name: expo.name ?? pkgJson?.name ?? 'rollipop-expo-example',
    slug: expo.slug ?? 'rollipop-expo-example',
    version: expo.version ?? pkgJson?.version ?? '0.0.1',
    orientation: expo.orientation ?? 'default',
    platforms: expo.platforms ?? ['android', 'ios'],
    scheme: expo.scheme,
    userInterfaceStyle: expo.userInterfaceStyle,
    newArchEnabled: expo.newArchEnabled,
    android: expo.android,
    ios: expo.ios,
    plugins: expo.plugins,
    bundleUrl,
    debuggerHost: baseHost,
    logUrl: `${baseUrl}/logs`,
    developer: { tool: 'expo' },
    mainModuleName: 'index',
    packagerOpts: {
      dev: true,
      strict: false,
      minify: false,
      urlType: 'lan',
    },
    dependencies,
    id,
    scopeKey: id,
    runtimeVersion: expo.runtimeVersion ?? { policy: 'appVersion' },
    sdkVersion: expo.sdkVersion ?? '57.0.0',
    hostUri: baseHost,
  };
}

const plugin = fp<ExpoManifestPluginOptions>(
  (fastify, options) => {
    const { context } = options;

    const sendManifest = (request: any, reply: any) => {
      const manifest = buildManifest(context, request);
      return reply
        .header('Content-Type', 'application/json')
        .header('Exponent-Server-Host', new URL(context.serverBaseUrl).host)
        .status(200)
        .send(manifest);
    };

    fastify
      .get('/manifest', (_request, reply) => sendManifest(_request, reply))
      .get('/index.exp', (_request, reply) => sendManifest(_request, reply));
  },
  { name: 'expo-manifest' },
);

export { plugin as expoManifest };
