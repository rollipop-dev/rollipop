import { describe, expect, it, vi } from 'vite-plus/test';

import {
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

  it('emits a remote module cache with load/invalidate API', () => {
    const code = loadVirtualModule(VIRTUAL_HOST_INIT_ID, baseConfig);
    expect(code).toContain('subscribers: new Set()');
    expect(code).toContain('invalidatedIds: new Set()');
    expect(code).toContain('load(id)');
    expect(code).toContain('invalidate(remoteName)');
    expect(code).toContain('instance.loadRemote(id)');
  });

  it('logs an error when a remote bundle fails to reload during HMR', () => {
    const code = loadVirtualModule(VIRTUAL_HOST_INIT_ID, baseConfig);
    expect(code).toContain('failed to reload remote');
    expect(code).toContain('console.error');
  });

  it('emits a websocket subscriber that listens to each remote dev server', () => {
    const code = loadVirtualModule(VIRTUAL_HOST_INIT_ID, baseConfig);
    expect(code).toContain('"/hot"');
    expect(code).toContain('"mf:remote-update"');
    expect(code).toContain('new WebSocket(wsUrl)');
  });

  it('emits share scope re-exports', () => {
    const code = loadVirtualModule(VIRTUAL_SHARE_SCOPE_ID, baseConfig);
    expect(code).toContain(`from '@module-federation/runtime'`);
    expect(code).toContain('loadRemote');
  });

  it('returns null for unknown virtual id', () => {
    expect(loadVirtualModule('\0rollipop:module-federation:unknown', baseConfig)).toBeNull();
  });
});
