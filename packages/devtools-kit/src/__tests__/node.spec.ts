import { defineDevframe } from 'devframe';
import type { RollipopDevToolsNodeContext } from 'rollipop';
import { describe, expect, it, vi } from 'vite-plus/test';

import { createPluginFromDevframe } from '../node';

describe('createPluginFromDevframe', () => {
  it('creates a Rollipop plugin from a Devframe definition', async () => {
    const devframe = defineDevframe({
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      packageName: 'example',
      homepage: 'https://example.com',
      description: 'Example devframe',
      capabilities: {
        dev: true,
        build: false,
      },
      setup() {},
    });
    const install = vi.fn().mockResolvedValue(undefined);
    const context = { install } as unknown as RollipopDevToolsNodeContext;

    const plugin = createPluginFromDevframe(devframe);
    await plugin.devtools?.setup(context);

    expect(plugin.name).toBe('devframe:example');
    expect(plugin.devtools?.capabilities).toEqual({
      dev: true,
      build: false,
    });
    expect(install).toHaveBeenCalledWith(devframe, {
      base: undefined,
      dock: undefined,
    });
  });

  it('forwards adapter overrides and runs Rollipop-only setup after installation', async () => {
    const devframe = defineDevframe({
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      packageName: 'example',
      homepage: 'https://example.com',
      description: 'Example devframe',
      setup() {},
    });
    const invokedOrder: string[] = [];
    const install = vi.fn(async () => {
      invokedOrder.push('install');
    });
    const setup = vi.fn(() => {
      invokedOrder.push('setup');
    });
    const context = { install } as unknown as RollipopDevToolsNodeContext;

    const plugin = createPluginFromDevframe(devframe, {
      name: 'custom-plugin',
      base: '/custom/',
      dock: {
        category: 'framework',
        title: 'Custom title',
      },
      capabilities: {
        dev: {
          rpc: true,
          views: true,
        },
      },
      setup,
    });
    await plugin.devtools?.setup(context);

    expect(plugin.name).toBe('custom-plugin');
    expect(plugin.devtools?.capabilities).toEqual({
      dev: {
        rpc: true,
        views: true,
      },
    });
    expect(install).toHaveBeenCalledWith(devframe, {
      base: '/custom/',
      dock: {
        category: 'framework',
        title: 'Custom title',
      },
    });
    expect(setup).toHaveBeenCalledWith(context);
    expect(invokedOrder).toEqual(['install', 'setup']);
  });
});
