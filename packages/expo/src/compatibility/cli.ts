import { createRequire } from 'node:module';
import path from 'node:path';

import type { ServerOptions } from 'rollipop';

import type {
  AppConfig,
  BuildMode,
  NativeExportExtra,
  NativeExportOptions,
  NativeExportResult,
} from '../types';

interface StartOptions {
  port: number;
  mode?: BuildMode;
  location: { hostType?: string };
  resetDevServer?: boolean;
  isExporting?: boolean;
}

// SDK 55–58 share this private server contract. Load and check it before patching a prototype.
export interface ExpoDevServer {
  projectRoot: string;
  initUrlCreator(options: StartOptions): Promise<void> | void;
  getUrlCreator(): { constructUrl(options: { scheme: string }): string };
  getManifestMiddlewareAsync(options: StartOptions): Promise<{
    getHandler(): NonNullable<ServerOptions['inspector']>['middleware'];
  }>;
  startImplementationAsync: (this: ExpoDevServer, options: StartOptions) => Promise<unknown>;
  nativeExportBundleAsync: (
    this: { projectRoot: string },
    exp: AppConfig,
    options: NativeExportOptions,
    files: Map<string, unknown>,
    extra?: NativeExportExtra,
  ) => Promise<NativeExportResult>;
  watchEnvironmentVariables(...args: unknown[]): Promise<unknown>;
  waitForTypeScriptAsync(...args: unknown[]): Promise<unknown>;
}

export interface HermesBuildOptions {
  projectRoot: string;
  code: string;
  map: string | null;
  filename: string;
  minify: boolean;
}

export interface HermesBuildResult {
  hbc: Buffer;
  sourcemap: string | null;
}

interface DebugOptions {
  serverBaseUrl: string;
  reporter: {
    update(event: { level: 'debug' | 'info' | 'warn' | 'error'; data: unknown[] }): void;
  };
}

interface DebugMiddleware {
  debugMiddleware: NonNullable<ServerOptions['inspector']>['middleware'];
  debugWebsocketEndpoints: NonNullable<ServerOptions['inspector']>['websocketEndpoints'];
}

// Keep private module paths and callable checks here, rather than spreading them through feature code.
export function createExpoCli(expoRequire: NodeRequire, version: string) {
  const cliRoot = path.dirname(expoRequire.resolve('@expo/cli/package.json'));
  const cliRequire = createRequire(path.join(cliRoot, 'package.json'));
  function loadFunction<T>(filename: string, name: string): T {
    const exports: Record<string, unknown> = cliRequire(filename);
    if (typeof exports[name] !== 'function') {
      throw new Error(
        `@rollipop/expo: unsupported @expo/cli ${version}; missing ${name} in ${filename}`,
      );
    }
    return exports[name] as T;
  }
  return {
    getServerPrototype(): ExpoDevServer {
      const Server = loadFunction<{ prototype: ExpoDevServer }>(
        path.join(cliRoot, 'build/src/start/server/metro/MetroBundlerDevServer.js'),
        'MetroBundlerDevServer',
      );
      const prototype = Server.prototype;
      for (const method of [
        'startImplementationAsync',
        'nativeExportBundleAsync',
        'initUrlCreator',
        'getManifestMiddlewareAsync',
        'getUrlCreator',
        'watchEnvironmentVariables',
        'waitForTypeScriptAsync',
      ] as const) {
        if (typeof prototype[method] !== 'function') {
          throw new Error(`@rollipop/expo: unsupported @expo/cli ${version}; missing ${method}`);
        }
      }
      return prototype;
    },
    getRouterDirectoryModuleIdWithManifest(projectRoot: string, exp: AppConfig): string {
      return loadFunction<(root: string, config: AppConfig) => string>(
        path.join(cliRoot, 'build/src/start/server/metro/router.js'),
        'getRouterDirectoryModuleIdWithManifest',
      )(projectRoot, exp);
    },
    createDebugMiddleware(options: DebugOptions): DebugMiddleware {
      return loadFunction<(options: DebugOptions) => DebugMiddleware>(
        path.join(cliRoot, 'build/src/start/server/metro/debugging/createDebugMiddleware.js'),
        'createDebugMiddleware',
      )(options);
    },
    buildHermesBundleAsync(options: HermesBuildOptions): Promise<HermesBuildResult> {
      const metroRoot = path.dirname(expoRequire.resolve('@expo/metro-config/package.json'));
      return loadFunction<(options: HermesBuildOptions) => Promise<HermesBuildResult>>(
        path.join(metroRoot, 'build/serializer/exportHermes.js'),
        'buildHermesBundleAsync',
      )(options);
    },
    getTypedRoutesDeclarationFile(context: unknown, options: unknown): string {
      return loadFunction<(context: unknown, options: unknown) => string>(
        '@expo/router-server/build/typed-routes/generate',
        'getTypedRoutesDeclarationFile',
      )(context, options);
    },
    getUpdatesExportPaths(): string[] {
      return [
        path.join(cliRoot, 'build/src/expoUpdatesExports.js'),
        expoRequire.resolve('@expo/cli/internal/unstable-expo-updates-exports'),
        expoRequire.resolve('expo/internal/unstable-expo-updates-cli-exports'),
      ];
    },
  };
}
