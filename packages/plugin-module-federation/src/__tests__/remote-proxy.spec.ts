import vm from 'node:vm';

import * as React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { REMOTE_CACHE_GLOBAL } from '../constants';
import { generateRemoteProxyCode } from '../virtual/remote-proxy';

const remoteId = 'remote_app/RemoteNavigator';

function loadProxy(modules: Record<string, unknown>, load = vi.fn()) {
  const code = generateRemoteProxyCode({ remoteId });
  const context = {
    [REMOTE_CACHE_GLOBAL]: { modules, load },
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
});
