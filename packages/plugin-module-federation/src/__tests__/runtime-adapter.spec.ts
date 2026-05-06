import { describe, expect, it } from 'vite-plus/test';

import { generateRuntimeAdapterCode } from '../virtual/runtime-adapter';

describe('generateRuntimeAdapterCode', () => {
  it('exports a default plugin object with loadEntry hook', () => {
    const code = generateRuntimeAdapterCode();
    expect(code).toContain('async loadEntry({ remoteInfo })');
    expect(code).toContain('globalThis.__rollipop_script_loader__');
    expect(code).toContain('loadScript({');
    expect(code).toContain('export default adapter');
  });

  it('throws if script loader is missing at runtime', () => {
    const code = generateRuntimeAdapterCode();
    expect(code).toContain('\\u0027globalThis.__rollipop_script_loader__\\u0027 is not registered');
  });
});
