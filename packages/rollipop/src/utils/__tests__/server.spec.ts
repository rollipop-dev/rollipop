import { describe, expect, it } from 'vite-plus/test';

import { getServerDisplayUrl } from '../server';

describe('getServerDisplayUrl', () => {
  it.each([
    ['http://[::1]:8081', 'http://localhost:8081/dashboard'],
    ['http://127.0.0.1:49152', 'http://localhost:49152/dashboard'],
    ['https://localhost:8081', 'https://localhost:8081/dashboard'],
    ['http://192.168.1.10:8081', 'http://192.168.1.10:8081/dashboard'],
    ['http://[2001:db8::1]:8081', 'http://[2001:db8::1]:8081/dashboard'],
  ])('formats %s for display', (address, expected) => {
    expect(getServerDisplayUrl(address, '/dashboard')).toBe(expected);
  });
});
