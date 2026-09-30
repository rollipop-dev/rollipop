export function getBaseUrl(host: string, port: number, https?: boolean) {
  return `${https ? 'https' : 'http'}://${host}:${port}`;
}

export function getServerDisplayUrl(address: string, pathname: string) {
  const url = new URL(pathname, address);
  if (url.hostname === '[::1]' || url.hostname === '127.0.0.1') {
    url.hostname = 'localhost';
  }
  return url.href;
}
