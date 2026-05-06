import { describe, expect, it } from 'vite-plus/test';

import { generateRemoteEntryCode } from '../virtual/remote-entry';

describe('generateRemoteEntryCode', () => {
  it('imports each expose by file path and registers container globally', () => {
    const code = generateRemoteEntryCode({
      name: 'my_remote',
      exposes: {
        './Button': '/abs/src/Button.tsx',
        './List': '/abs/src/List.tsx',
      },
    });

    expect(code).toContain(`import * as __expose_0 from "/abs/src/Button.tsx";`);
    expect(code).toContain(`import * as __expose_1 from "/abs/src/List.tsx";`);
    expect(code).toContain(`"./Button": () => __expose_0`);
    expect(code).toContain(`"./List": () => __expose_1`);
    expect(code).toContain(`globalThis["my_remote"] = container;`);
  });

  it('does not emit ESM exports (must be valid in script eval mode)', () => {
    const code = generateRemoteEntryCode({
      name: 'r',
      exposes: { './A': '/abs/A.tsx' },
    });
    expect(code).not.toMatch(/^export\b/m);
  });

  it('emits empty module map for empty exposes', () => {
    const code = generateRemoteEntryCode({ name: 'r', exposes: {} });
    expect(code).toContain('const moduleMap = {');
  });
});
