import { describe, expect, it } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { resolveBuildOptions } from '../build-options';

describe('resolveBuildOptions', () => {
  it('should not share resolved option objects across calls', () => {
    const config = createTestConfig('/root/project');
    const android = resolveBuildOptions(config, { platform: 'android', dev: true });
    const ios = resolveBuildOptions(config, { platform: 'ios', dev: true });

    expect(android).not.toBe(ios);
    expect(android).toEqual(
      expect.objectContaining({
        platform: 'android',
        dev: true,
        minify: false,
      }),
    );
    expect(ios).toEqual(
      expect.objectContaining({
        platform: 'ios',
        dev: true,
        minify: false,
      }),
    );
  });

  it('should not mutate input build options', () => {
    const config = createTestConfig('/root/project');
    const buildOptions = {
      platform: 'ios',
      dev: true,
      outfile: 'dist/index.bundle',
    };

    resolveBuildOptions(config, buildOptions);

    expect(buildOptions.outfile).toBe('dist/index.bundle');
  });
});
