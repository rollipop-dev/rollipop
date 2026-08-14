import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateExpoRouterManifest, serializeExpoRouterManifestCode } from './router-manifest';

function makeApp(structure: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rollipop-router-'));
  const appDir = join(root, 'app');
  mkdirSync(appDir, { recursive: true });
  for (const [rel, content] of Object.entries(structure)) {
    const filePath = join(appDir, rel);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, content);
  }
  return appDir;
}

describe('generateExpoRouterManifest', () => {
  it('returns an empty manifest when app/ is missing', () => {
    const appDir = join(mkdtempSync(join(tmpdir(), 'rollipop-empty-')), 'app');
    const manifest = generateExpoRouterManifest(appDir);
    expect(manifest.routes).toEqual([]);
    expect(manifest.initialRouteName).toBe('');
  });

  it('maps a flat index + screen layout', () => {
    const appDir = makeApp({
      'index.tsx': 'export default function Home() {}',
      'about.tsx': 'export default function About() {}',
      '_layout.tsx': 'export default function Layout() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const routes = manifest.routes.map((r) => r.route).sort();
    expect(routes).toContain(''); // index -> ''
    expect(routes).toContain('about');
    expect(manifest.initialRouteName).toBe('/');
  });

  it('marks nodes with a layout via hasLayout', () => {
    const appDir = makeApp({
      'index.tsx': 'export default function Home() {}',
      '_layout.tsx': 'export default function Layout() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const index = manifest.routes.find((r) => r.route === '');
    expect(index?.hasLayout).toBe(true);
  });

  it('treats (group) directories as path-less', () => {
    const appDir = makeApp({
      '(tabs)/index.tsx': 'export default function TabsHome() {}',
      '(tabs)/settings.tsx': 'export default function Settings() {}',
      'index.tsx': 'export default function Home() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const routes = manifest.routes.map((r) => r.route).sort();
    // group folds its children to top level: '', 'settings'
    expect(routes).toContain('');
    expect(routes).toContain('settings');
    expect(routes).not.toContain('(tabs)');
  });

  it('captures dynamic [param] routes', () => {
    const appDir = makeApp({
      '[id].tsx': 'export default function User() {}',
      'index.tsx': 'export default function Home() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const user = manifest.routes.find((r) => r.route === '[id]');
    expect(user).toBeDefined();
    expect(user?.params).toEqual(['id']);
  });

  it('captures rest [...param] routes', () => {
    const appDir = makeApp({
      '[...slug].tsx': 'export default function CatchAll() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const catchAll = manifest.routes.find((r) => r.route === '[...slug]');
    expect(catchAll?.params).toEqual(['slug']);
  });

  it('treats users/[id].tsx as a nested child of users', () => {
    const appDir = makeApp({
      'users/index.tsx': 'export default function Users() {}',
      'users/[id].tsx': 'export default function User() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const users = manifest.routes.find((r) => r.route === 'users');
    expect(users).toBeDefined();
    const child = users?.children.find((c) => c.route === '[id]');
    expect(child?.params).toEqual(['id']);
  });

  it('serializes to an importable ESM module', () => {
    const appDir = makeApp({
      'index.tsx': 'export default function Home() {}',
    });
    const manifest = generateExpoRouterManifest(appDir);
    const code = serializeExpoRouterManifestCode(manifest);
    expect(code).toContain('export const __expoRouterManifest');
    expect(code).toContain('export const initialRouteName');
    expect(code).toContain('export default __expoRouterManifest');
  });
});
