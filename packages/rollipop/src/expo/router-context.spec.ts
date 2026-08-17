import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { scanRouteFiles, serializeExpoRouterContextCode, type RouteEntry } from './router-context';

/** Build a temp app/ tree and return its path; cleaned up automatically. */
function makeAppTree(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-ctx-'));
  const appDir = path.join(root, 'app');
  fs.mkdirSync(appDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return {
    dir: root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

const SCREEN = 'export default function Screen() { return null; }';

describe('scanRouteFiles', () => {
  it('enumerates screens, layouts, groups, dynamic and rest routes', () => {
    const app = makeAppTree({
      'index.tsx': SCREEN,
      '_layout.tsx': SCREEN,
      'about.tsx': SCREEN,
      'users/_layout.tsx': SCREEN,
      'users/index.tsx': SCREEN,
      'users/[id].tsx': SCREEN,
      'blog/[...slug].tsx': SCREEN,
      '(marketing)/pricing.tsx': SCREEN,
      '+not-found.tsx': SCREEN,
    });
    try {
      const entries = scanRouteFiles(path.join(app.dir, 'app'));
      const keys = entries.map((e: RouteEntry) => e.key).sort();
      expect(keys).toEqual(
        [
          './+not-found.tsx',
          './(marketing)/pricing.tsx',
          './_layout.tsx',
          './about.tsx',
          './blog/[...slug].tsx',
          './index.tsx',
          './users/[id].tsx',
          './users/_layout.tsx',
          './users/index.tsx',
        ].sort(),
      );
      // Every entry carries an absolute, existing path.
      for (const e of entries) {
        expect(path.isAbsolute(e.absPath)).toBe(true);
        expect(fs.existsSync(e.absPath)).toBe(true);
      }
    } finally {
      app.cleanup();
    }
  });

  it('excludes _-framework files and directories (other than _layout) and non-screen extensions', () => {
    const app = makeAppTree({
      'index.tsx': SCREEN,
      '_constants.ts': 'export const x = 1;',
      '_utils/format.ts': 'export const f = 1;',
      '_components/Button.tsx': SCREEN,
      'data.json': '{}',
      'styles.css': '.a{}',
    });
    try {
      const keys = scanRouteFiles(path.join(app.dir, 'app')).map((e) => e.key);
      expect(keys).toEqual(['./index.tsx']);
    } finally {
      app.cleanup();
    }
  });

  it('returns an empty array when the routes directory does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-ctx-noapp-'));
    try {
      expect(scanRouteFiles(path.join(root, 'app'))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips node_modules inside the routes directory', () => {
    const app = makeAppTree({
      'index.tsx': SCREEN,
      'node_modules/dep/index.tsx': SCREEN,
    });
    try {
      const keys = scanRouteFiles(path.join(app.dir, 'app')).map((e: RouteEntry) => e.key);
      expect(keys).toEqual(['./index.tsx']);
    } finally {
      app.cleanup();
    }
  });
});

describe('serializeExpoRouterContextCode', () => {
  it('emits a ctx RequireContext with static requires and a keys()/loader API', () => {
    const code = serializeExpoRouterContextCode([
      { key: './index.tsx', absPath: '/abs/app/index.tsx' },
      { key: './users/[id].tsx', absPath: '/abs/app/users/[id].tsx' },
    ]);

    expect(code).toContain('export { ctx };');
    expect(code).toContain('require("/abs/app/index.tsx")');
    expect(code).toContain('require("/abs/app/users/[id].tsx")');
    expect(code).toContain('ctx.keys = () =>');
    expect(code).toContain('ctx.id = "expo-router/_ctx"');
    // The loader must surface the already-loaded module.
    expect(code).toContain('const mod = __rollipopRoutes[key];');
  });

  it('produces a module whose ctx loader returns the registered route module', () => {
    const code = serializeExpoRouterContextCode([
      { key: './index.tsx', absPath: '/abs/app/index.tsx' },
      { key: './users/[id].tsx', absPath: '/abs/app/users/[id].tsx' },
    ]);
    // Compile the generated module in an isolated vm context with a stub
    // `require`, and verify the exposed `ctx` behaves like a RequireContext.
    const { runInNewContext } = require('node:vm');
    const sandbox: {
      module: { exports: { ctx?: unknown } };
      require: (p: string) => { __module: string };
    } = {
      module: { exports: {} },
      require: (p: string) => ({ __module: p }),
    };
    const script = code.replace('export { ctx };', 'module.exports = { ctx };');
    runInNewContext(script, sandbox);
    const ctx = sandbox.module.exports.ctx;
    expect(ctx).toBeDefined();
    const c = ctx as {
      keys: () => string[];
      (key: string): { __module: string };
    };
    expect(c.keys().sort()).toEqual(['./index.tsx', './users/[id].tsx'].sort());
    expect(c('./index.tsx')).toEqual({ __module: '/abs/app/index.tsx' });
    expect(c('./users/[id].tsx')).toEqual({ __module: '/abs/app/users/[id].tsx' });
  });
});
