import { describe, expect, it } from 'vite-plus/test';

import {
  VIRTUAL_HOST_INIT_ID,
  VIRTUAL_REMOTE_ENTRY_ID,
  VIRTUAL_RUNTIME_ADAPTER_ID,
  VIRTUAL_SHARE_SCOPE_ID,
} from '../constants';
import { resolveVirtualId } from '../host/resolve';

describe('resolveVirtualId', () => {
  it.each([
    VIRTUAL_HOST_INIT_ID,
    VIRTUAL_RUNTIME_ADAPTER_ID,
    VIRTUAL_SHARE_SCOPE_ID,
    VIRTUAL_REMOTE_ENTRY_ID,
  ])('returns id as-is for %s', (id) => {
    expect(resolveVirtualId(id)).toBe(id);
  });

  it('returns null for non-virtual ids', () => {
    expect(resolveVirtualId('react')).toBeNull();
    expect(resolveVirtualId('./local.ts')).toBeNull();
    expect(resolveVirtualId('remote_app/Foo')).toBeNull();
  });
});
