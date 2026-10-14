import vm from 'node:vm';

import { createInstance } from '@module-federation/runtime';
import { describe, expect, it, vi } from 'vite-plus/test';

import {
  REMOTE_CACHE_GLOBAL,
  SCRIPT_LOADER_GLOBAL,
  VIRTUAL_HOST_INIT_ID,
  VIRTUAL_RUNTIME_ADAPTER_ID,
  VIRTUAL_SHARE_SCOPE_ID,
} from '../constants';
import { loadVirtualModule } from '../host/load';
import { normalizeConfig } from '../normalize';

vi.mock('../shared/resolve-version', () => ({
  resolveSharedVersion: () => '18.3.1',
}));

const baseConfig = normalizeConfig(
  {
    name: 'host_app',
    remotes: { remote_app: 'http://localhost:8082/remoteEntry.js' },
    shared: ['react'],
  },
  '/root',
);

describe('loadVirtualModule', () => {
  it('emits runtime adapter that delegates to __rollipop_script_loader__', () => {
    const code = loadVirtualModule(VIRTUAL_RUNTIME_ADAPTER_ID, baseConfig);
    expect(code).toContain('globalThis.__rollipop_script_loader__');
    expect(code).toContain('loadEntry');
    expect(code).toContain('export default adapter');
  });

  it('emits host init that calls @module-federation/runtime init', () => {
    const code = loadVirtualModule(VIRTUAL_HOST_INIT_ID, baseConfig);
    expect(code).toContain(`from '@module-federation/runtime'`);
    expect(code).toContain('createInstance({');
    expect(code).toContain(`name: "host_app"`);
    expect(code).toContain('__rollipop_module_federation_cache__');
    expect(code).toContain('__rollipop_shared__');
    expect(code).toContain(`"react": require("react")`);
  });

  it('emits a remote module cache without a whole-bundle invalidation path', () => {
    const code = loadVirtualModule(VIRTUAL_HOST_INIT_ID, baseConfig);
    expect(code).toContain('load(id)');
    expect(code).toContain('instance.loadRemote(id)');
  });

  it('emits share scope re-exports', () => {
    const code = loadVirtualModule(VIRTUAL_SHARE_SCOPE_ID, baseConfig);
    expect(code).toContain(`from '@module-federation/runtime'`);
    expect(code).toContain('loadRemote');
  });

  it.each(['string', 'object'] as const)(
    'resolves an aliased remote through the federation runtime with %s config',
    async (form) => {
      const alias = `remote_alias_${form}`;
      const name = `actual_remote_${form}`;
      const entry = `https://example.test/${name}.js`;
      const config = normalizeConfig(
        {
          name: `host_${form}`,
          remotes: { [alias]: form === 'string' ? `${name}@${entry}` : { name, entry } },
        },
        '/root',
      );
      const mod = { default: () => null };
      const container = { init: vi.fn(), get: vi.fn(() => () => mod) };
      const loadScript = vi.fn().mockResolvedValue(undefined);
      const context = {
        createInstance,
        [SCRIPT_LOADER_GLOBAL]: { loadScript },
        [name]: container,
        [REMOTE_CACHE_GLOBAL]: undefined as unknown as { load(id: string): Promise<unknown> },
      };
      const adapterCode = loadVirtualModule(VIRTUAL_RUNTIME_ADAPTER_ID, config)!;
      const hostCode = loadVirtualModule(VIRTUAL_HOST_INIT_ID, config)!;
      vm.runInNewContext(
        [
          adapterCode.replace('export default adapter;', ''),
          hostCode
            .replace(`import adapter from ${JSON.stringify(VIRTUAL_RUNTIME_ADAPTER_ID)};`, '')
            .replace("import { createInstance } from '@module-federation/runtime';", ''),
        ].join('\n'),
        context,
      );

      await expect(context[REMOTE_CACHE_GLOBAL].load(`${alias}/RemoteNavigator`)).resolves.toBe(
        mod,
      );
      expect(loadScript).toHaveBeenCalledExactlyOnceWith({ scriptId: name, url: entry });
      expect(container.init).toHaveBeenCalledOnce();
      expect(container.get).toHaveBeenCalledExactlyOnceWith('./RemoteNavigator');
    },
  );

  it('returns null for unknown virtual id', () => {
    expect(loadVirtualModule('\0rollipop:module-federation:unknown', baseConfig)).toBeNull();
  });
});
