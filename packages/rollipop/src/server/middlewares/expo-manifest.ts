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
 * This module serves a minimal but valid Expo manifest JSON:
 *   - `/manifest` and `/index.exp` via Fastify routes (the React Native
 *     community middleware does not intercept those paths), and
 *   - `/` via an Express-style (middie) interceptor registered BEFORE the
 *     React Native community middleware, because that middleware otherwise
 *     serves its own `<!DOCTYPE html>` dashboard at `/` and short-circuits
 *     before any Fastify route runs. The interceptor only answers manifest
 *     requests (Dev Client sends the `expo-platform` header, or an
 *     `Accept` that is not `text/html`); browser requests fall through to the
 *     React Native dashboard via `next()`.
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

type ManifestRequestLike = { headers: Record<string, any>; query?: any };

function parseRuntimePlatform(request: ManifestRequestLike): string {
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

function isManifestRequest(request: ManifestRequestLike): boolean {
  const headers = request.headers ?? {};
  const query = request.query ?? {};
  if (headers['expo-platform'] || headers['exponent-platform']) return true;
  if (typeof query.platform === 'string') return true;
  const accept = headers['accept'];
  // Native dev clients request JSON (often `Accept: */*`); browsers request
  // HTML. Treat any request that does not explicitly want HTML as a manifest
  // request so the React Native dashboard (served at `/` for browsers) is
  // unaffected.
  if (typeof accept === 'string' && !accept.includes('text/html')) return true;
  return false;
}

function buildManifest(context: DevServerContext, request: ManifestRequestLike) {
  const root = context.config.root ?? process.cwd();
  const appJson = readJsonSafe<{ expo?: Record<string, any> }>(path.join(root, 'app.json'));
  const pkgJson = readJsonSafe<Record<string, any>>(path.join(root, 'package.json'));

  // Derive the Expo fields locally from `app.json` (the canonical source for
  // `slug`/`name`/`sdkVersion`/`runtimeVersion` in a non-ejected Expo project)
  // plus `package.json` as fallback. This avoids taking a hard dependency on
  // `@expo/config` inside the Rollipop package, while still producing a real,
  // per-project `id`/`scopeKey` instead of the hardcoded example values that
  // would otherwise leak into every app and break OTA / expo-updates identity.
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

  // Derive the app `id`/`scopeKey` from the real project config. Falls back to a
  // stable, non-example default only when neither app.json nor package.json
  // provide a name, so every app gets a correct, unique identity.
  const appName = expo.name ?? pkgJson?.name ?? 'rollipop-expo-app';
  const id = `@${appName.replace(/[^a-z0-9_-]/gi, '')}/${expo.slug ?? appName}`;

  return {
    name: appName,
    slug: expo.slug ?? appName,
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
    // Reflect the project's real SDK version when set; otherwise omit rather
    // than asserting a hardcoded `'57.0.0'` that could contradict the app.
    ...(expo.sdkVersion ? { sdkVersion: expo.sdkVersion } : {}),
    hostUri: baseHost,
  };
}

/**
 * Express-style (middie) interceptor for the dev server root `/`. It must run
 * BEFORE the React Native community middleware, which would otherwise serve its
 * own HTML dashboard at `/` and prevent the Dev Client from fetching the
 * manifest. Serves the manifest JSON for Dev Client requests, otherwise defers
 * to the next middleware (the React Native dashboard).
 */
export function createExpoManifestInterceptor(context: DevServerContext) {
  return (req: any, res: any, next: (err?: unknown) => void) => {
    const url = req.url ?? '';
    // Only intercept the bare root; manifest sub-paths are handled by Fastify.
    if (url !== '/' && url !== '') {
      return next();
    }
    const requestLike: ManifestRequestLike = { headers: req.headers ?? {}, query: req.query };
    if (!isManifestRequest(requestLike)) {
      return next();
    }
    const manifest = buildManifest(context, requestLike);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Exponent-Server-Host', new URL(context.serverBaseUrl).host);
    res.statusCode = 200;
    res.end(JSON.stringify(manifest));
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

    // Metro-compatible file-watch / reload long-poll endpoint used by the Expo
    // Dev Client (and `expo start` consumers). The client polls `/onchange`
    // (root path, like Metro) and expects a 200 with a (possibly empty) list
    // of changed file roots; on a non-empty response it reloads. Rollipop does
    // not yet push file changes through this channel, so we ack the poll with
    // an empty change set — the dev client treats that as "no changes" and
    // re-polls, which keeps the connection alive without surfacing a spurious
    // load failure. Registered at root (not under a REST prefix) because the
    // native Dev Client requests `/onchange` exactly as Metro exposes it.
    fastify.get('/onchange', (_request, reply) => {
      return reply.status(200).send([]);
    });
  },
  { name: 'expo-manifest' },
);

export { plugin as expoManifest };
