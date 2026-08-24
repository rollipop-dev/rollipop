export function getBaseUrl(host: string, port: number, https?: boolean) {
  // IPv6 hosts (e.g. `::`) must be bracketed in a URL, otherwise
  // `new URL(path, 'http://:::8081')` throws ERR_INVALID_URL. When the host is
  // a bare IPv6 address, wrap it in `[...]`.
  const normalizedHost = /^[0-9a-fA-F:]+$/.test(host) && host.includes(':')
    ? `[${host}]`
    : host;
  return `${https ? 'https' : 'http'}://${normalizedHost}:${port}`;
}
