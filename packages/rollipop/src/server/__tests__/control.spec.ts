// oxlint-disable typescript-eslint(unbound-method)
import fs from 'node:fs';

import type { Mock } from 'vite-plus/test';
import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

import type { ServerEventBus } from '../events/event-bus';

vitest.mock('../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vitest.mock('../../core/fs/data', () => ({
  getSharedDataPath: (basePath: string) => `${basePath}/.rollipop`,
}));

interface MockEventBus {
  emit: Mock;
}

function createMockEventBus(): MockEventBus {
  return { emit: vi.fn() };
}

interface MockRoute {
  method: string;
  path: string;
  handler: (request: unknown, reply: MockReply) => Promise<unknown>;
}

interface MockReply {
  send: Mock;
}

function createMockReply(): MockReply {
  return { send: vi.fn().mockReturnThis() };
}

type PluginFn = (
  fastify: unknown,
  options: { projectRoot: string; eventBus: unknown },
  done: () => void,
) => void;

function registerControlRoutes(projectRoot: string, eventBus: MockEventBus) {
  const routes: MockRoute[] = [];
  const fastify = {
    all(path: string, handler: MockRoute['handler']) {
      routes.push({ method: 'all', path, handler });
    },
  };

  (control as PluginFn)(
    fastify,
    { projectRoot, eventBus: eventBus as unknown as ServerEventBus },
    () => {},
  );

  return routes;
}

const { control } = await import('../middlewares/control');

describe('control plugin', () => {
  let eventBus: MockEventBus;
  const projectRoot = '/project';

  beforeEach(() => {
    eventBus = createMockEventBus();
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register /reset-cache route only', () => {
    const routes = registerControlRoutes(projectRoot, eventBus);
    const paths = routes.map((r) => r.path);

    expect(paths).toContain('/reset-cache');
    expect(paths).not.toContain('/rebuild');
  });

  it('/reset-cache should clear cache directory and emit event', async () => {
    const routes = registerControlRoutes(projectRoot, eventBus);
    const route = routes.find((r) => r.path === '/reset-cache')!;
    const reply = createMockReply();

    await route.handler({}, reply);

    expect(fs.rmSync).toHaveBeenCalledWith('/project/.rollipop/cache', {
      recursive: true,
      force: true,
    });
    expect(eventBus.emit).toHaveBeenCalledWith({ type: 'cache_reset' });
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      message: 'Cache cleared',
    });
  });
});
