import { describe, expect, it, vi } from 'vite-plus/test';

import { normalizeConfig, normalizeRemotes, normalizeShared } from '../normalize';

vi.mock('../shared/resolve-version', () => ({
  resolveSharedVersion: (name: string) => (name === 'react' ? '18.3.1' : undefined),
}));

describe('normalizeRemotes', () => {
  it('treats a plain URL string as the entry, using the object key as the name', () => {
    expect(normalizeRemotes({ remote_app: 'http://localhost:8082/remoteEntry.js' })).toEqual({
      remote_app: {
        name: 'remote_app',
        entry: 'http://localhost:8082/remoteEntry.js',
        type: 'var',
        entryGlobalName: 'remote_app',
      },
    });
  });

  it("parses '<name>@<url>' shorthand into name + entry", () => {
    expect(
      normalizeRemotes({
        module1: 'module1@https://example.com/module1.container.bundle',
      }),
    ).toEqual({
      module1: {
        name: 'module1',
        entry: 'https://example.com/module1.container.bundle',
        type: 'var',
        entryGlobalName: 'module1',
      },
    });
  });

  it('keeps object form as-is and uses name as entry global name', () => {
    expect(
      normalizeRemotes({
        my_remote: { name: 'my-remote', entry: 'https://cdn/r.js' },
      }),
    ).toEqual({
      my_remote: {
        name: 'my-remote',
        entry: 'https://cdn/r.js',
        type: 'var',
        entryGlobalName: 'my-remote',
      },
    });
  });
});

describe('normalizeShared', () => {
  it('accepts string array', () => {
    expect(normalizeShared(['react'], '/root')).toEqual({
      react: {
        version: '18.3.1',
        requiredVersion: undefined,
        singleton: false,
        eager: false,
      },
    });
  });

  it('accepts string-version object', () => {
    expect(normalizeShared({ react: '^18.0.0' }, '/root')).toMatchObject({
      react: {
        version: '18.3.1',
        requiredVersion: '^18.0.0',
        singleton: false,
        eager: false,
      },
    });
  });

  it('accepts full config object', () => {
    expect(
      normalizeShared({ react: { requiredVersion: '^18', singleton: true, eager: true } }, '/root'),
    ).toMatchObject({
      react: {
        version: '18.3.1',
        requiredVersion: '^18',
        singleton: true,
        eager: true,
      },
    });
  });
});

describe('normalizeConfig', () => {
  it('throws on missing name', () => {
    expect(() => normalizeConfig({} as never, '/root')).toThrow(/'name' is required/);
  });

  it("throws when expose key does not start with './'", () => {
    expect(() =>
      normalizeConfig({ name: 'host', exposes: { Button: './Button.tsx' } }, '/root'),
    ).toThrow(/Expose key 'Button'/);
  });

  it('throws when remote object lacks name or entry', () => {
    expect(() =>
      normalizeConfig({ name: 'host', remotes: { x: { name: 'x' } as never } }, '/root'),
    ).toThrow(/Remote 'x'/);
  });

  it('flags hasRemotes/hasExposes correctly', () => {
    const result = normalizeConfig(
      {
        name: 'host',
        remotes: { r: 'http://x/r.js' },
        exposes: { './A': './a.ts' },
      },
      '/root',
    );
    expect(result.hasRemotes).toBe(true);
    expect(result.hasExposes).toBe(true);
  });
});
