import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cssModule } from '../css-module-transform';

const plugin = cssModule() as {
  name: string;
  load: { handler: (id: string) => Promise<{ code: string; moduleType: string; id?: string }> };
  transform: { handler: (code: string, id: string) => { code?: string } | void };
};

describe('css-module-transform', () => {
  it('converts a module.css into a class-name map', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rollipop-css-'));
    const file = join(dir, 'styles.module.css');
    writeFileSync(file, '.foo { color: red; }\n.bar { color: blue; }');

    const loaded = await plugin.load.handler(file);
    expect(loaded.moduleType).toBe('js');
    // The converted module must carry the class-name map, NOT `export default {}`.
    expect(loaded.code).toContain('export default');
    expect(loaded.code).toContain('foo');
    expect(loaded.code).toContain('bar');
    expect(loaded.code).not.toBe('export default {};\n');
  });

  it('does NOT double-transform the generated JS (regression guard)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rollipop-css-'));
    const file = join(dir, 'styles.module.css');
    writeFileSync(file, '.foo { color: red; }');

    const loaded = await plugin.load.handler(file);
    // Simulate the downstream transform hook receiving the *converted* JS id.
    // The legacy bug re-ran the transform on the generated JS (which has no
    // `[.#]` selectors) and silently rewrote it to `export default {}`,
    // dropping the class-name map. The guard must leave it untouched.
    const transformed = plugin.transform.handler(loaded.code, `${file}?rollipop-css-module`);
    if (transformed) {
      expect(transformed.code).toBeUndefined();
    }
    // And the load output itself must still be the real map.
    expect(loaded.code).toContain('foo');
  });

  it('discards plain css as an empty default export', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rollipop-css-'));
    const file = join(dir, 'global.css');
    writeFileSync(file, '.foo { color: red; }');

    const loaded = await plugin.load.handler(file);
    expect(loaded.code).toBe('export default {};\n');
  });

  it('is a no-op for non-CSS ids', async () => {
    const loaded = await plugin.load.handler('/some/module.tsx');
    expect(loaded).toBeUndefined();
  });
});
