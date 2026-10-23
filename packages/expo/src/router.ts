import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin, PluginWithHotUpdate } from 'rollipop';
import { exactRegex, id, include } from 'rollipop/filter';

import type { ExpoCompatibility } from './compatibility';
import type { AppConfig } from './types';

// Native Expo Router uses Metro's require.context plus Babel environment inlining. Keep the Router runtime intact and supply the same synchronous context contract.
export function createRouterPlugin(projectRoot: string, appRoot: string) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  let routerRoot;
  try {
    routerRoot = path.dirname(projectRequire.resolve('expo-router/package.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    return null;
  }
  const contexts = new Set(
    ['_ctx.js', '_ctx.ios.js', '_ctx.android.js'].map((file) => path.join(routerRoot, file)),
  );

  return {
    name: '@rollipop/expo:router',
    config: {
      rolldownOptions(options) {
        Object.assign(options.input!.transform!.define!, {
          'process.env.EXPO_PROJECT_ROOT': JSON.stringify(projectRoot),
          'process.env.EXPO_ROUTER_ABS_APP_ROOT': JSON.stringify(appRoot),
          'process.env.EXPO_ROUTER_APP_ROOT': JSON.stringify(path.relative(routerRoot, appRoot)),
          'process.env.EXPO_ROUTER_IMPORT_MODE': '"sync"',
        });
        return options;
      },
    },
    load: {
      filter: [...contexts].map((file) => include(id(exactRegex(file)))),
      handler(id) {
        if (!contexts.has(id)) return;
        if (!fs.existsSync(appRoot))
          throw new Error(`Expo Router route directory is missing: ${appRoot}`);
        const files: [string, string][] = [];
        const visit = (directory: string) => {
          this.addWatchFile(directory);
          for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(absolute);
            else if (entry.isFile()) {
              const key = `./${path.relative(appRoot, absolute).split(path.sep).join('/')}`;
              if (/(?:\+api|\+middleware)\.[tj]sx?$/.test(key)) {
                throw new Error(
                  `@rollipop/expo does not support API route servers or middleware: ${key}`,
                );
              }
              // Same native-route scope as expo-router/_ctx.{ios,android}.js.
              if (
                /^\.\/(?!(?:(?:.*\+api)|(?:\+html)|(?:\+middleware))\.[tj]sx?$).*\.[tj]sx?$/.test(
                  key,
                )
              ) {
                files.push([key, absolute]);
              }
            }
          }
        };
        visit(appRoot);
        files.sort(([left], [right]) => left.localeCompare(right));
        return `const routes = {\n${files
          .map(
            ([key, absolute]) =>
              `  ${JSON.stringify(key)}: () => require(${JSON.stringify(absolute)})`,
          )
          .join(',\n')}\n};
export function ctx(key) {
  if (!Object.prototype.hasOwnProperty.call(routes, key)) {
    const error = new Error("Cannot find route module '" + key + "'");
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }
  return routes[key]();
}
ctx.keys = () => Object.keys(routes);
ctx.resolve = (key) => {
  if (!Object.prototype.hasOwnProperty.call(routes, key)) return ctx(key);
  return key;
};
ctx.id = ${JSON.stringify(appRoot)};
`;
      },
    },
    hotUpdate({ type, file, modules }) {
      const relative = path.relative(appRoot, file);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
      if (
        type !== 'delete' &&
        fs.existsSync(file) &&
        !fs.statSync(file).isDirectory() &&
        this.getModuleInfo(file) != null
      ) {
        // Directory watch dependencies can select the context too. Existing routes keep their boundary, including atomic saves reported as create.
        return modules.filter((id) => !contexts.has(id));
      }
      if (type !== 'delete' && fs.existsSync(file)) return;
      // A deleted route must be removed from the context before Rolldown tries to reload its old module ID. Existing route edits keep ordinary HMR.
      return [
        ...new Set([
          ...modules.filter((id) => id !== file),
          ...[...contexts].filter((id) => this.getModuleInfo(id) != null),
        ]),
      ];
    },
  } satisfies Plugin & PluginWithHotUpdate;
}

export function getRouterRoot(compatibility: ExpoCompatibility, exp: AppConfig): string {
  const { projectRoot, cli } = compatibility;
  return path.resolve(projectRoot, cli.getRouterDirectoryModuleIdWithManifest(projectRoot, exp));
}

// SDK 58 also exports an API server during native builds when web.output is server. Disable that implicit request for this native-only adapter, and reject actual server features rather than silently dropping them.
export function configureNativeRouter<T extends AppConfig>(config: T): T {
  if (config.experiments?.reactServerComponentRoutes || config.experiments?.reactServerFunctions) {
    throw new Error('@rollipop/expo does not support React Server Components or server functions');
  }
  const router = config.extra?.router;
  if (router?.apiRoutes === true) {
    throw new Error('@rollipop/expo does not support API route servers');
  }
  config.extra = { ...config.extra, router: { ...router, apiRoutes: false } };
  return config;
}
