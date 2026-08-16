/**
 * Generate an Expo Router route manifest from a project's `app/` directory.
 *
 * Expo Router expects a static manifest describing the route tree (built by
 * Metro's custom resolver). Under Rollipop we produce it directly from the
 * filesystem at build start and inject it as a virtual module
 * (`expo-router-manifest`), which `expo-router/entry` reads to bootstrap
 * navigation.
 *
 * Conventions implemented (subset sufficient for a minimal working app):
 * - Top-level entries under `app/` are route segments. A segment may be either a
 *   directory (screen = its `index` file) or a screen file directly
 *   (e.g. `users.tsx`, `[id].tsx`).
 * - `(group)` directories do not add a path segment (children fold up).
 * - Dynamic routes: `[param]` (one segment) and `[...param]` (rest segment).
 * - `_layout` files mark a layout (not a routable screen by themselves).
 * - `+html`, `+native-intent`, and other `+`-prefixed files are Expo Router
 *   "route" extras; excluded from the screen list but layouts still detected.
 * - Files/dirs starting with `_` (other than `_layout`) are framework files and
 *   excluded from routes.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface RouteNode {
  /** Route path segment as exposed to the router (without leading slash). */
  route: string;
  /** Absolute path to the screen module (a `.tsx`/`.ts`/`.jsx`/`.js` file). */
  file: string;
  /** Child routes, if this node has a layout or is a directory with children. */
  children: RouteNode[];
  /** Whether this node introduces a layout (`_layout` present). */
  hasLayout: boolean;
  /** Dynamic params captured by this route. */
  params: string[];
}

export interface ExpoRouterManifest {
  /** The generated route tree, keyed by top-level segment. */
  routes: RouteNode[];
  /** Initial deep-link route name (the app index). */
  initialRouteName: string;
}

const SCREEN_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];

function isGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

function isFrameworkFile(name: string): boolean {
  return name.startsWith('_') && !name.startsWith('_layout');
}

function isRouteExtra(name: string): boolean {
  return name.startsWith('+');
}

function dynamicParam(name: string): string | null {
  const m = name.match(/^\[(\.\.\.)?(.+?)\]$/);
  if (!m) return null;
  return m[2];
}

function stripExt(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? file : file.slice(0, dot);
}

function existsSyncSafe(p: string): boolean {
  try {
    return fs.existsSync(p);
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

function hasLayout(dir: string): boolean {
  return SCREEN_EXTENSIONS.some((ext) => existsSyncSafe(path.join(dir, `_layout.${ext}`)));
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function screenFileForDir(dir: string): string | null {
  for (const ext of SCREEN_EXTENSIONS) {
    const candidate = path.join(dir, `index.${ext}`);
    if (existsSyncSafe(candidate)) return candidate;
  }
  return null;
}

/**
 * Build a route node for one `app/` entry (a directory or a screen file).
 */
function buildNode(appDir: string, entryName: string): RouteNode | null {
  const entryPath = path.join(appDir, entryName);
  const params: string[] = [];
  let route: string;
  let screenFile: string | null = null;
  let children: RouteNode[] = [];

  if (isDirectory(entryPath)) {
    // Directory route: `index.<ext>` is the screen; sub-entries are children.
    route = entryName === 'index' ? '' : stripExt(entryName);
    const dyn = dynamicParam(entryName);
    if (dyn) params.push(dyn);
    screenFile = screenFileForDir(entryPath);
    for (const child of readDirSafe(entryPath)) {
      if (isFrameworkFile(child) || isRouteExtra(child)) continue;
      const childPath = path.join(entryPath, child);
      if (!isDirectory(childPath)) {
        // A nested screen file (e.g. `users/[id].tsx` where `users` is a dir).
        if (isScreenFile(child)) {
          const childNode = buildNodeFromFile(childPath, child, entryPath);
          if (childNode) children.push(childNode);
        }
        continue;
      }
      if (isGroup(child)) {
        children.push(...buildGroup(entryPath, child));
      } else {
        const childNode = buildNode(entryPath, child);
        if (childNode) children.push(childNode);
      }
    }
  } else {
    // Screen file directly: `users.tsx`, `[id].tsx`, `index.tsx`.
    const node = buildNodeFromFile(entryPath, entryName, appDir);
    return node;
  }

  return {
    route,
    file: screenFile ?? entryPath,
    children,
    hasLayout: hasLayout(entryPath),
    params,
  };
}

function buildNodeFromFile(filePath: string, fileName: string, dir: string): RouteNode | null {
  if (!isScreenFile(fileName)) return null;
  const base = stripExt(fileName);
  const dyn = dynamicParam(base);
  const route = base === 'index' ? '' : base;
  return {
    route,
    file: filePath,
    children: [],
    hasLayout: hasLayout(dir),
    params: dyn ? [dyn] : [],
  };
}

function buildGroup(groupDir: string, groupName: string): RouteNode[] {
  const groupPath = path.join(groupDir, groupName);
  const children: RouteNode[] = [];
  for (const child of readDirSafe(groupPath)) {
    if (isFrameworkFile(child) || isRouteExtra(child)) continue;
    const childPath = path.join(groupPath, child);
    if (!isDirectory(childPath)) {
      if (isScreenFile(child)) {
        const node = buildNodeFromFile(childPath, child, groupPath);
        if (node) children.push(node);
      }
      continue;
    }
    if (isGroup(child)) {
      children.push(...buildGroup(groupPath, child));
    } else {
      const node = buildNode(groupPath, child);
      if (node) children.push(node);
    }
  }
  return children;
}

function isScreenFile(name: string): boolean {
  if (isRouteExtra(name)) return false;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  return SCREEN_EXTENSIONS.includes(ext) && !name.startsWith('_layout');
}

/**
 * Scan `appDir` and produce the route tree.
 *
 * Returns an empty manifest with `initialRouteName: ''` when the directory does
 * not exist or contains no screens (non-Expo-Router projects).
 */
export function generateExpoRouterManifest(
  appDir: string,
  projectRoot: string = path.dirname(appDir),
): ExpoRouterManifest {
  const routes: RouteNode[] = [];
  // Normalize a screen file path to the module id form used by the bundler
  // (relative to the project root, e.g. "app/index.tsx"). Rollipop registers
  // route screens under that id, so the manifest must reference them the same
  // way or expo-router's getRoutes() cannot resolve the screen modules.
  const toModuleId = (file: string) => path.relative(projectRoot, file).split(path.sep).join('/');

  if (!existsSyncSafe(appDir)) {
    return { routes, initialRouteName: '' };
  }

  for (const entry of readDirSafe(appDir)) {
    if (isFrameworkFile(entry) || isRouteExtra(entry)) continue;
    const entryPath = path.join(appDir, entry);
    if (!isDirectory(entryPath)) {
      if (isScreenFile(entry)) {
        const node = buildNodeFromFile(entryPath, entry, appDir);
        if (node) {
          node.file = toModuleId(node.file);
          routes.push(node);
        }
      }
      continue;
    }
    if (isGroup(entry)) {
      const groupNodes = buildGroup(appDir, entry);
      for (const n of groupNodes) normalizeNode(n, projectRoot);
      routes.push(...groupNodes);
      continue;
    }
    const node = buildNode(appDir, entry);
    if (node) {
      normalizeNode(node, projectRoot);
      routes.push(node);
    }
  }

  // The initial route name is the index route (`route === ''`, i.e. `index.tsx`)
  // when present, otherwise the first top-level route. Returning `'/'` for a
  // project whose first filesystem entry is a non-index screen (FS ordering is
  // not guaranteed) would deep-link to a non-existent path, so we resolve it
  // from the route tree itself rather than hardcoding `'/'`.
  const indexRoute = routes.find((r) => r.route === '');
  const initialRouteName = (indexRoute ?? routes[0])?.route ?? '';

  return {
    routes,
    initialRouteName,
  };
}

/** Recursively rewrite a node's `file` (and its children's) to the module-id
 *  form relative to the project root (e.g. "app/index.tsx"). */
function normalizeNode(node: RouteNode, projectRoot: string): void {
  if (node.file) node.file = path.relative(projectRoot, node.file).split(path.sep).join('/');
  for (const child of node.children) normalizeNode(child, projectRoot);
}

/** Serialize the manifest into the ESM source for the virtual module.
 *  Also emits `require()` calls for every screen module (resolved by absolute
 *  path, which the static bundler can follow) so the route screens are actually
 *  bundled. Metro discovers them via `require.context` over `app/`; here we
 *  pull them in explicitly. The JSON manifest keeps `file` paths relative to
 *  the project root (e.g. "app/index.tsx") so expo-router's getRoutes() resolves
 *  them against the bundled module ids. */
export function serializeExpoRouterManifestCode(
  manifest: ExpoRouterManifest,
  projectRoot: string,
): string {
  const screenFiles = collectScreenFiles(manifest.routes);
  const requires = screenFiles
    .map((file) => `require(${JSON.stringify(path.join(projectRoot, file))});`)
    .join('\n');
  return [
    requires,
    `export const __expoRouterManifest = ${JSON.stringify(manifest.routes, null, 2)};`,
    `export const initialRouteName = ${JSON.stringify(manifest.initialRouteName)};`,
    `export default __expoRouterManifest;`,
  ].join('\n');
}

/** Collect every screen module path in the route tree (deduplicated).
 *  Only real screen files (with a screen extension) are included — directory
 *  nodes expose their `file` as the directory path, which is not requireable. */
function collectScreenFiles(routes: RouteNode[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (node: RouteNode) => {
    if (node.file && /\.(tsx|ts|jsx|js)$/.test(node.file) && !seen.has(node.file)) {
      seen.add(node.file);
      out.push(node.file);
    }
    for (const child of node.children) visit(child);
  };
  for (const route of routes) visit(route);
  return out;
}
