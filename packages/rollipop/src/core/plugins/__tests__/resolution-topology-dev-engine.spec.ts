import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { dev, type DevEngine } from '@rollipop/rolldown/experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { resolutionTopology } from '../resolution-topology-plugin';

describe('resolutionTopology with the native dev engine', () => {
  let root: string;
  let engine: DevEngine | undefined;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-topology-engine-')));
    fs.writeFileSync(path.join(root, 'main.js'), "import './parent.js';\n");
    fs.writeFileSync(
      path.join(root, 'parent.js'),
      "import { value } from './feature'; globalThis.value = value; import.meta.hot.accept();\n",
    );
    fs.writeFileSync(path.join(root, 'feature.js'), "export const value = 'original-js';\n");
  });

  afterEach(async () => {
    await engine?.close();
    engine = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function startEngine() {
    const resolve = { extensions: ['.ts', '.tsx', '.js'] };
    const onOutput = vi.fn();
    const onHmrUpdates = vi.fn();
    engine = await dev(
      {
        cwd: root,
        input: './main.js',
        resolve,
        experimental: { devMode: true },
        plugins: [resolutionTopology({ root, resolve })],
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
    await engine.run();
    expect(onOutput).toHaveBeenCalled();
    const initial = onOutput.mock.calls.at(-1)![0];
    expect(initial).not.toBeInstanceOf(Error);
    await engine.registerClient('test');
    for (const output of initial.output) {
      if (output.type === 'chunk') {
        await engine.notifyPayloadDelivered(output.fileName);
      }
    }
    // PollWatcher compares whole-second mtimes, including watched directories.
    await sleep(1100);
    onHmrUpdates.mockClear();

    const findPatch = () =>
      onHmrUpdates.mock.calls
        .flatMap(([result]) => (result instanceof Error ? [] : result.updates))
        .find(({ clientId, update }) => clientId === 'test' && update.type === 'Patch')?.update;
    return { engine, onHmrUpdates, findPatch };
  }

  it.each([
    { change: 'create', winner: 'feature.ts', marker: 'new-ts' },
    { change: 'rename', winner: 'feature.ts', marker: 'original-js' },
    { change: 'delete', winner: 'feature.js', marker: 'original-js' },
  ])(
    'updates extensionless imports after candidate $change',
    async ({ change, winner, marker }) => {
      const js = path.join(root, 'feature.js');
      const ts = path.join(root, 'feature.ts');
      if (change === 'delete') {
        fs.writeFileSync(ts, "export const value = 'preferred-ts';\n");
      }
      const { engine, onHmrUpdates, findPatch } = await startEngine();

      if (change === 'create') {
        fs.writeFileSync(ts, "export const value = 'new-ts';\n");
      } else if (change === 'rename') {
        fs.renameSync(js, ts);
      } else {
        fs.unlinkSync(ts);
      }

      await expect.poll(findPatch, { timeout: 10_000 }).toBeTruthy();
      expect(findPatch().code).toContain(marker);
      expect(findPatch().code).toContain(winner);
      expect(engine.moduleGraph.getModuleIds()).toContain(path.join(root, winner));
      expect(engine.moduleGraph.getModuleInfo(path.join(root, 'parent.js'))?.importedIds).toContain(
        path.join(root, winner),
      );
      expect(onHmrUpdates.mock.calls.some(([result]) => result instanceof Error)).toBe(false);
    },
  );

  it('keeps resolving candidates through repeated create, delete, and edit updates', async () => {
    const ts = path.join(root, 'feature.ts');
    const { engine, onHmrUpdates, findPatch } = await startEngine();
    const changes = [
      { winner: 'feature.ts', marker: 'first-ts', apply: () => writeTs('first-ts') },
      { winner: 'feature.js', marker: undefined, apply: () => fs.unlinkSync(ts) },
      { winner: 'feature.ts', marker: 'second-ts', apply: () => writeTs('second-ts') },
      { winner: 'feature.ts', marker: 'edited-ts', apply: () => writeTs('edited-ts') },
      {
        winner: 'feature.ts',
        marker: 'replaced-ts',
        apply: () => {
          const replacement = path.join(root, 'replacement.tmp');
          fs.writeFileSync(replacement, "export const value = 'replaced-ts';\n");
          fs.renameSync(replacement, ts);
        },
      },
    ];
    for (const change of changes) {
      onHmrUpdates.mockClear();
      change.apply();
      await expect.poll(findPatch, { timeout: 10_000 }).toBeTruthy();
      const patch = findPatch();
      expect(patch.code).toContain(change.winner);
      // A previously delivered fallback module need not be sent again in the patch.
      if (change.marker != null) {
        expect(patch.code).toContain(change.marker);
      }
      expect(engine.moduleGraph.getModuleInfo(path.join(root, 'parent.js'))?.importedIds).toContain(
        path.join(root, change.winner),
      );
      expect(onHmrUpdates.mock.calls.some(([result]) => result instanceof Error)).toBe(false);
      await engine.notifyPayloadDelivered(patch.filename);
      await sleep(1100);
    }

    function writeTs(marker: string) {
      fs.writeFileSync(ts, `export const value = '${marker}';\n`);
    }
  });

  it('recovers from deleting the only candidate when another extension is created', async () => {
    const { engine, onHmrUpdates, findPatch } = await startEngine();
    fs.unlinkSync(path.join(root, 'feature.js'));
    await expect
      .poll(() => onHmrUpdates.mock.calls.some(([result]) => result instanceof Error), {
        timeout: 10_000,
      })
      .toBe(true);
    await sleep(1100);
    onHmrUpdates.mockClear();

    const ts = path.join(root, 'feature.ts');
    fs.writeFileSync(ts, "export const value = 'recovered-ts';\n");
    await expect.poll(findPatch, { timeout: 10_000 }).toBeTruthy();
    expect(findPatch().code).toContain('recovered-ts');
    expect(engine.moduleGraph.getModuleInfo(path.join(root, 'parent.js'))?.importedIds).toContain(
      ts,
    );
    expect(onHmrUpdates.mock.calls.some(([result]) => result instanceof Error)).toBe(false);
  });
});
