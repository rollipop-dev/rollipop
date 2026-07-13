import { describe, expect, it } from 'vite-plus/test';

import { generateRemoteProxyCode } from '../virtual/remote-proxy';

describe('generateRemoteProxyCode', () => {
  it('encodes the federation request id', () => {
    const code = generateRemoteProxyCode({
      remoteId: 'remote_app/RemoteNavigator',
      reactAware: true,
    });
    expect(code).toContain('const __id = "remote_app/RemoteNavigator";');
  });

  it('emits a React-aware proxy that renders the refresh-managed component type', () => {
    const code = generateRemoteProxyCode({ remoteId: 'remote_app', reactAware: true });
    expect(code).toContain("import * as __mfReact from 'react'");
    expect(code).toContain('__mfReact.createElement(fn, props)');
  });

  it('emits a plain proxy without React when reactAware=false', () => {
    const code = generateRemoteProxyCode({ remoteId: 'remote_app', reactAware: false });
    expect(code).not.toContain('__mfReact');
    expect(code).not.toContain('useState');
    expect(code).toContain('fn.apply(this, args)');
  });

  it('exposes the proxy as default export', () => {
    const code = generateRemoteProxyCode({ remoteId: 'remote_app', reactAware: true });
    expect(code).toContain('export default __proxy');
  });

  it('throws the pending promise when the module is not yet cached', () => {
    const code = generateRemoteProxyCode({ remoteId: 'remote_app', reactAware: true });
    expect(code).toContain('throw __ensureLoaded()');
  });
});
