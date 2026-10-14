import vm from 'node:vm';

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { REMOTE_CACHE_GLOBAL, VIRTUAL_RUNTIME_ADAPTER_ID } from '../constants';
import { normalizeConfig } from '../normalize';
import { retryRemote } from '../runtime';
import { generateHostInitCode } from '../virtual/host-init';
import { generateRemoteProxyCode } from '../virtual/remote-proxy';

const remoteId = 'remote_app/RemoteNavigator';

function loadProxy(
  modules: Record<string, unknown>,
  load = vi.fn(),
  errors: Record<string, unknown> = {},
) {
  const code = generateRemoteProxyCode({ remoteId });
  const context = {
    [REMOTE_CACHE_GLOBAL]: { modules, errors, load },
    __mfReact: React,
    proxy: undefined as unknown as React.FunctionComponent & Record<string, unknown>,
  };
  vm.runInNewContext(
    code
      .replace("import * as __mfReact from 'react';", '')
      .replace('export default __proxy;', 'globalThis.proxy = __proxy;'),
    context,
  );
  return context.proxy;
}

function loadCache(loadRemote: (id: string) => Promise<unknown>) {
  const config = normalizeConfig(
    {
      name: 'host_app',
      remotes: { remote_app: 'http://localhost:8082/remoteEntry.js' },
    },
    '/root',
  );
  const context = {
    adapter: {},
    createInstance: () => ({ loadRemote }),
    [REMOTE_CACHE_GLOBAL]: undefined as unknown as {
      modules: Record<string, unknown>;
      pending: Record<string, Promise<unknown>>;
      errors: Record<string, unknown>;
      load(id: string): Promise<unknown>;
    },
  };
  vm.runInNewContext(
    generateHostInitCode(config)
      .replace(`import adapter from ${JSON.stringify(VIRTUAL_RUNTIME_ADAPTER_ID)};`, '')
      .replace("import { createInstance } from '@module-federation/runtime';", ''),
    context,
  );
  return context[REMOTE_CACHE_GLOBAL];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateRemoteProxyCode', () => {
  it('encodes the federation request id', () => {
    expect(generateRemoteProxyCode({ remoteId })).toContain(
      'const __id = "remote_app/RemoteNavigator";',
    );
  });

  it.each([
    ['function', () => null],
    ['memo', React.memo(() => null)],
    ['forwardRef', React.forwardRef(() => null)],
    [
      'class',
      class extends React.Component {
        render() {
          return null;
        }
      },
    ],
  ])('renders a %s component through React', (_, component) => {
    const proxy = loadProxy({ [remoteId]: { default: component } });
    const props = { children: 'remote' };
    const element = proxy(props) as React.ReactElement;

    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe(component);
    expect(element.props).toEqual(props);
  });

  it('renders a directly exported component', () => {
    const component = React.memo(() => null);
    const proxy = loadProxy({ [remoteId]: component });
    expect((proxy({}) as React.ReactElement).type).toBe(component);
  });

  it('forwards named exports and static component properties', () => {
    const action = vi.fn(() => 'result');
    const component = Object.assign(() => null, { displayName: 'Remote' });
    const proxy = loadProxy({ [remoteId]: { default: component, action } });
    expect(proxy.action).toBe(action);
    expect((proxy.action as typeof action)()).toBe('result');
    expect(proxy.displayName).toBe('Remote');
    expect(proxy.__esModule).toBe(true);
    expect(proxy.then).toBeUndefined();
  });

  it('suspends while loading and reads the latest component from the cache', () => {
    const first = React.memo(() => null);
    const second = React.forwardRef(() => null);
    const modules: Record<string, unknown> = {};
    const pending = Promise.resolve();
    const load = vi.fn(() => pending);
    const proxy = loadProxy(modules, load);
    let suspended: unknown;
    try {
      void proxy({});
    } catch (error) {
      suspended = error;
    }
    expect(suspended).toBe(pending);
    expect(load).toHaveBeenCalledWith(remoteId);

    modules[remoteId] = { default: first };
    expect((proxy({}) as React.ReactElement).type).toBe(first);
    modules[remoteId] = { default: second };
    expect((proxy({}) as React.ReactElement).type).toBe(second);
  });

  it('shares pending loads and reuses the resolved module', async () => {
    const mod = { default: () => null };
    const loadRemote = vi.fn().mockResolvedValue(mod);
    const cache = loadCache(loadRemote);

    const pending = cache.load(remoteId);
    expect(cache.load(remoteId)).toBe(pending);
    await expect(pending).resolves.toBe(mod);
    expect(cache.pending).not.toHaveProperty(remoteId);
    await expect(cache.load(remoteId)).resolves.toBe(mod);
    expect(loadRemote).toHaveBeenCalledExactlyOnceWith(remoteId);
  });

  it('throws a failed load to the Error Boundary and recovers after an explicit retry', async () => {
    const error = new Error('Remote is offline');
    const component = () => null;
    const mod = { default: component };
    const loadRemote = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(mod);
    const cache = loadCache(loadRemote);
    vi.stubGlobal(REMOTE_CACHE_GLOBAL, cache);
    const proxy = loadProxy(
      cache.modules,
      vi.fn((id) => cache.load(id)),
      cache.errors,
    );

    let suspended: unknown;
    try {
      void proxy({});
    } catch (thrown) {
      suspended = thrown;
    }
    expect(suspended).toBe(cache.pending[remoteId]);
    await expect(suspended).rejects.toBe(error);
    expect(cache.pending).not.toHaveProperty(remoteId);
    expect(() => proxy({})).toThrow(error);
    expect(loadRemote).toHaveBeenCalledTimes(1);

    const retry = retryRemote(remoteId);
    expect(cache.errors).not.toHaveProperty(remoteId);
    expect(loadRemote).toHaveBeenCalledTimes(2);
    try {
      void proxy({});
    } catch (thrown) {
      suspended = thrown;
    }
    expect(suspended).toBe(cache.pending[remoteId]);
    expect(loadRemote).toHaveBeenCalledTimes(2);
    await expect(retry).resolves.toBe(mod);
    expect(cache.pending).not.toHaveProperty(remoteId);
    expect((proxy({}) as React.ReactElement).type).toBe(component);
  });
});
