import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { PluginObject } from '@babel/core';
import { dev, type DevOptions } from '@rollipop/rolldown/experimental';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { BundlerContext } from '../../types';
import { babel } from '../babel-plugin';

describe('babel with the native dev engine', () => {
  it('applies merged rules once per HMR transform', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-babel-engine-')));
    const entry = path.join(root, 'main.js');
    const writeEntry = (value: string) => {
      fs.writeFileSync(entry, `globalThis.value = '${value}'; import.meta.hot.accept();`);
    };
    writeEntry('initial');

    const onOutput = vi.fn<NonNullable<DevOptions['onOutput']>>();
    const onHmrUpdates = vi.fn<NonNullable<DevOptions['onHmrUpdates']>>();
    const engine = await dev(
      {
        cwd: root,
        input: './main.js',
        experimental: { devMode: true },
        plugins: babel({
          context: { state: { revision: 0 } } as BundlerContext,
          transformConfig: {
            rules: [
              {
                options: {
                  plugins: [
                    function marker(): PluginObject {
                      return {
                        visitor: {
                          StringLiteral(path) {
                            path.node.value += '-babel';
                          },
                        },
                      };
                    },
                  ],
                },
              },
            ],
          },
        }),
      },
      { dir: path.join(root, 'output') },
      {
        hotUpdate: true,
        rebuildStrategy: 'never',
        watch: {
          usePolling: true,
          pollInterval: 50,
          useDebounce: true,
          debounceDuration: 50,
          skipWrite: true,
        },
        onOutput,
        onHmrUpdates,
      },
    );

    try {
      await engine.run();
      const initial = onOutput.mock.calls.at(-1)![0];
      if (initial instanceof Error) throw initial;
      await engine.registerClient('test');
      for (const output of initial.output) {
        if (output.type === 'chunk') {
          await engine.notifyPayloadDelivered(output.fileName);
        }
      }

      for (const value of ['first-update', 'second-update']) {
        // PollWatcher compares whole-second mtimes.
        await sleep(1100);
        onHmrUpdates.mockClear();
        writeEntry(value);
        await expect
          .poll(() => onHmrUpdates.mock.calls.length, { timeout: 10_000 })
          .toBeGreaterThan(0);
        const result = onHmrUpdates.mock.calls.at(-1)![0];
        if (result instanceof Error) throw result;
        const patch = result.updates.find(
          ({ clientId, update }) => clientId === 'test' && update.type === 'Patch',
        )?.update;
        if (patch?.type !== 'Patch') throw new Error('Expected HMR patch');
        expect(patch.code).toContain(`${value}-babel`);
        expect(patch.code).not.toContain(`${value}-babel-babel`);
        await engine.notifyPayloadDelivered(patch.filename);
      }
    } finally {
      await engine.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
