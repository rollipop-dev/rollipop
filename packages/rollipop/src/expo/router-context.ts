/**
 * Generate the `expo-router/_ctx` virtual module for Rollipop.
 *
 * Expo Router 57 discovers its route tree at runtime from a `RequireContext`
 * exposed by the `expo-router/_ctx` module (Metro generates this during
 * serialization). Rollipop cannot rely on Metro, so we materialize `_ctx` as a
 * virtual module whose `ctx` export is a RequireContext-shaped object built
 * from the project's `app/` directory.
 *
 * The shape mirrors what `getRoutes` (in `expo-router/build/getRoutesCore`)
 * consumes:
 *   - `ctx.keys()`            → array of route keys, e.g. `['./index.tsx', './users/[id].tsx']`
 *   - `ctx(key)`              → the loaded module (with its `default` export)
 *   - `ctx.id`                → a stable id (used for caching)
 *
 * Every route file is referenced through a **static `require()`** so Rollipop
 * bundles it into the module graph; the `ctx` loader then returns the already
 * registered module. This is the same contract Metro's `require.context`
 * satisfies and lets `getRoutes` build the full tree natively — groups,
 * dynamic `[id]`, rest `[...slug]`, modals, `+not-found`, `+middleware`, and
 * nested layouts — without any hand-rolled manifest.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getExpoRouterAppRoot } from './config-translator';

/** A single route entry discovered under the routes directory. */
export interface RouteEntry {
  /** Metro-style key relative to the routes directory, e.g. `./users/[id].tsx`. */
  key: string;
  /** Absolute filesystem path of the route module. */
  absPath: string;
}

const SCREEN_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function hasScreenExtension(name: string): boolean {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  return SCREEN_EXTENSIONS.includes(ext);
}

/**
 * Whether a file is a route file we should enumerate.
 *
 * Mirrors Expo Router's own file classification:
 *  - `_layout.*` is a layout (kept).
 *  - `+`-prefixed files (`+not-found`, `+middleware`, `+html`, `+native-intent`,
 *    `+api`) are route extras (kept; `+api`/`+html` are still modules in the
 *    graph even though `getRoutes` ignores them for navigation).
 *  - `_`-prefixed files that are NOT `_layout` are framework files (excluded,
 *    e.g. `_constants.ts`, `_utils.ts`).
 *  - anything without a screen extension is excluded (e.g. `.json`, `.css`).
 */
function isRouteFile(name: string): boolean {
  if (name.startsWith('_') && !name.startsWith('_layout')) {
    return false;
  }
  return hasScreenExtension(name);
}

/**
 * Recursively scan `appDir` and collect every route file as a `RouteEntry`.
 *
 * `key` is the Metro-style key relative to `appDir` (forward slashes, leading
 * `./`), which is exactly what `getRoutes` expects. Symbolic `node_modules`
 * directories are skipped. Returns an empty array (not an error) when the
 * routes directory does not exist.
 */
export function scanRouteFiles(appDir: string): RouteEntry[] {
  const out: RouteEntry[] = [];

  const visit = (dir: string, rel: string): void => {
    for (const name of readDirSafe(dir)) {
      if (name === 'node_modules') continue;
      // Framework files/dirs (e.g. `_constants.ts`, `_utils/`) hold helpers,
      // not routes. `_layout.*` is the one `_`-prefixed name that IS a route
      // file, so it must be kept. Compare against the name without extension
      // so `_layout.tsx` survives while `_layoutComponents/` is skipped.
      const nameWithoutExt = name.includes('.') ? name.slice(0, name.indexOf('.')) : name;
      if (name.startsWith('_') && nameWithoutExt !== '_layout') continue;
      const abs = path.join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (isDirectory(abs)) {
        visit(abs, childRel);
        continue;
      }
      if (isRouteFile(name)) {
        out.push({ key: `./${childRel}`, absPath: abs });
      }
    }
  };

  if (isDirectory(appDir)) {
    visit(appDir, '');
    // Stable ordering so the generated module is deterministic.
    out.sort((a, b) => a.key.localeCompare(b.key));
  }

  return out;
}

/** Resolve the routes directory for a project (honoring `src/app`, custom root). */
export function resolveAppDir(projectRoot: string): string {
  return path.join(projectRoot, getExpoRouterAppRoot(projectRoot));
}

/**
 * Serialize the `expo-router/_ctx` virtual module source.
 *
 * Emits one static `require()` per route (so Rollipop bundles every screen,
 * layout, and route extra), then builds a RequireContext-shaped `ctx` whose
 * loader returns the already-loaded module. No dynamic `require()` and no
 * dependency on bundler-internal globals — just the public `getRoutes` API.
 */
export function serializeExpoRouterContextCode(entries: RouteEntry[]): string {
  const requires = entries
    .map((entry) => `  ${JSON.stringify(entry.key)}: require(${JSON.stringify(entry.absPath)}),`)
    .join('\n');

  return [
    "// Generated by Rollipop — stands in for Metro's `expo-router/_ctx`.",
    "// Exposes a RequireContext over the app's route files for expo-router/getRoutes.",
    'const __rollipopRoutes = {',
    requires,
    '};',
    '',
    'const ctx = (key) => {',
    '  const mod = __rollipopRoutes[key];',
    '  if (!mod) {',
    '    throw new Error("[rollipop:expo-router] unknown route context key: " + key);',
    '  }',
    '  return mod;',
    '};',
    'ctx.keys = () => Object.keys(__rollipopRoutes);',
    'ctx.id = "expo-router/_ctx";',
    'ctx.resolve = (key) => key;',
    'ctx.load = (key) => Promise.resolve(ctx(key));',
    'ctx.loadAsync = ctx.load;',
    '',
    'export { ctx };',
    '',
  ].join('\n');
}
