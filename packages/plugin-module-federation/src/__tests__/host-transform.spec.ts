import { describe, expect, it } from 'vite-plus/test';

import { VIRTUAL_HOST_INIT_ID } from '../constants';
import { transformHostEntry } from '../host/transform';

describe('transformHostEntry', () => {
  it('prepends host-init import', () => {
    const code = `console.log('app');`;
    const result = transformHostEntry(code, '/src/index.ts');
    expect(result.code.startsWith(`import ${JSON.stringify(VIRTUAL_HOST_INIT_ID)};`)).toBe(true);
    expect(result.code).toContain(`console.log('app');`);
  });

  it('emits a source map', () => {
    const code = `console.log('app');`;
    const result = transformHostEntry(code, '/src/index.ts');
    expect(result.map).toBeDefined();
    expect(result.map!.toString()).toContain('mappings');
  });
});
