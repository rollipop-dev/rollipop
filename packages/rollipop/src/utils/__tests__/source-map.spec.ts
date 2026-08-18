import { describe, expect, it } from 'vite-plus/test';

import { rewriteSourceMappingUrlHost } from '../source-map';

describe('rewriteSourceMappingUrlHost', () => {
  const BUNDLE =
    "console.log('app');\n//# sourceMappingURL=http://0.0.0.0:8081/index.map?platform=android&dev=true&minify=false\n";

  it('rewrites the bind host (0.0.0.0) to the incoming request host', () => {
    const result = rewriteSourceMappingUrlHost(BUNDLE, '192.168.1.24:8081');
    expect(result).toContain(
      'sourceMappingURL=http://192.168.1.24:8081/index.map?platform=android&dev=true&minify=false',
    );
    // No double slash, no leftover bind host.
    expect(result).not.toContain('0.0.0.0');
    expect(result).not.toContain('//index.map');
  });

  it('uses the scheme supplied in the host when present', () => {
    const result = rewriteSourceMappingUrlHost(BUNDLE, 'https://10.0.0.5:1234');
    expect(result).toContain('sourceMappingURL=https://10.0.0.5:1234/index.map');
  });

  it('keeps path and query intact', () => {
    const result = rewriteSourceMappingUrlHost(BUNDLE, '192.168.1.24:8081');
    expect(result).toContain('?platform=android&dev=true&minify=false');
  });

  it('is a no-op when there is no sourceMappingURL comment', () => {
    const code = "console.log('app');\n";
    expect(rewriteSourceMappingUrlHost(code, '192.168.1.24:8081')).toBe(code);
  });

  it('is a no-op when the host is empty', () => {
    expect(rewriteSourceMappingUrlHost(BUNDLE, '')).toBe(BUNDLE);
  });

  it('rewrites the @-style sourceMappingURL line comment too', () => {
    const atBundle = '//@ sourceMappingURL=http://0.0.0.0:8081/index.map?platform=ios\n';
    const result = rewriteSourceMappingUrlHost(atBundle, '192.168.1.24:8081');
    expect(result).toContain('sourceMappingURL=http://192.168.1.24:8081/index.map?platform=ios');
  });

  it('is a no-op for block-comment sourceMappingURL (not emitted by rollipop)', () => {
    const blockBundle = '/*# sourceMappingURL=http://0.0.0.0:8081/index.map?platform=ios */\n';
    expect(rewriteSourceMappingUrlHost(blockBundle, '192.168.1.24:8081')).toBe(blockBundle);
  });
});
