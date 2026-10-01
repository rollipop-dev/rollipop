import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { resolveScaledAssets } from '../../core/assets';
import { createTestConfig } from '../../testing/config';
import { serveAssets } from '../middlewares/serve-assets';
import type { DevServerContext } from '../types';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe('serve assets middleware', () => {
  it('serves the platform-specific file matching the requested scale', async () => {
    const projectRoot = await createAssetFixture({
      'icon@2x.svg': svg(20, 20),
      'icon@2x.ios.svg': svg(22, 22),
    });
    const app = Fastify();

    try {
      await app.register(serveAssets, {
        context: {
          config: createTestConfig(projectRoot),
          options: { host: 'localhost', port: 8081, https: false },
        } as unknown as DevServerContext,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/assets/imgs/icon@2x.svg?platform=ios&hash=hash',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/svg+xml');
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(svg(22, 22))));
      expect(response.body).toBe(svg(22, 22));
    } finally {
      await app.close();
    }
  });

  it.each(['npm', 'yarn', 'pnpm'])('serves assets inside a %s workspace root', async (manager) => {
    const fixtureRoot = await createAssetFixture({ 'icon.svg': svg(10, 10) });
    const projectRoot = path.join(fixtureRoot, 'packages/app');
    await fs.mkdir(projectRoot, { recursive: true });
    if (manager === 'pnpm') {
      await fs.writeFile(
        path.join(fixtureRoot, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
    } else {
      await fs.writeFile(
        path.join(fixtureRoot, 'package.json'),
        JSON.stringify({
          workspaces: manager === 'yarn' ? { packages: ['packages/*'] } : ['packages/*'],
        }),
      );
    }
    const asset = await resolveScaledAssets({
      projectRoot,
      assetPath: path.join(fixtureRoot, 'imgs/icon.svg'),
      platform: 'ios',
      preferNativePlatform: false,
    });
    const app = Fastify();

    try {
      await app.register(serveAssets, {
        context: {
          config: createTestConfig(projectRoot),
          options: { host: 'localhost', port: 8081, https: false },
        } as unknown as DevServerContext,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: `${asset.httpServerLocation}/icon.svg?platform=ios&hash=${asset.hash}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(svg(10, 10));
    } finally {
      await app.close();
    }
  });

  it.each(['absolute', 'traversal', 'file symlink', 'directory symlink'])(
    'rejects outside assets requested through %s',
    async (kind) => {
      const fixtureRoot = await createAssetFixture({ 'icon.svg': svg(10, 10) });
      const projectRoot = path.join(fixtureRoot, 'app');
      await fs.mkdir(projectRoot);
      const outside = path.join(fixtureRoot, 'imgs/icon.svg');
      let requested = outside;
      if (kind === 'traversal') {
        requested = '../imgs/icon.svg';
      } else if (kind === 'file symlink') {
        await fs.symlink(outside, path.join(projectRoot, 'icon.svg'));
        requested = 'icon.svg';
      } else if (kind === 'directory symlink') {
        await fs.symlink(path.dirname(outside), path.join(projectRoot, 'imgs'));
        requested = 'imgs/icon.svg';
      }
      const app = Fastify();
      try {
        await app.register(serveAssets, {
          context: { config: createTestConfig(projectRoot) } as unknown as DevServerContext,
        });
        const response = await app.inject(`/assets/${encodeURIComponent(requested)}?platform=ios`);
        expect(response.statusCode).toBe(403);
        expect(response.body).not.toContain('<svg');
      } finally {
        await app.close();
      }
    },
  );

  it('rejects non-assets even inside the project root', async () => {
    const projectRoot = await createAssetFixture({ 'secret.env': 'TOKEN=private' });
    const app = Fastify();
    try {
      await app.register(serveAssets, {
        context: { config: createTestConfig(projectRoot) } as unknown as DevServerContext,
      });
      const response = await app.inject('/assets/imgs/secret.env?platform=ios');
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('private');
    } finally {
      await app.close();
    }
  });
});

async function createAssetFixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rollipop-serve-assets-'));
  tempRoots.push(root);

  const dir = path.join(root, 'imgs');
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([file, content]) => fs.writeFile(path.join(dir, file), content)),
  );

  return root;
}

function svg(width: number, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
}
