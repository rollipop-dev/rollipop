import { describe, expect, expectTypeOf, it } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { resolveBuildOptions, type ResolvedBuildOptions } from '../build-options';

describe('resolveBuildOptions', () => {
  it('keeps output fields optional in the resolved options type', () => {
    expectTypeOf<{ platform: string; dev: boolean }>().toExtend<ResolvedBuildOptions>();
  });

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

  it('inherits output options from config before applying defaults', () => {
    const config = createTestConfig('/root/project');
    config.output = { minify: true, sourcemap: 'hidden' };

    expect(resolveBuildOptions(config, { platform: 'ios' })).toMatchObject({
      minify: true,
      sourcemap: 'hidden',
    });
  });

  it('allows explicit build options to override configured output options', () => {
    const config = createTestConfig('/root/project');
    config.output = { minify: true, sourcemap: true };

    expect(
      resolveBuildOptions(config, { platform: 'ios', minify: false, sourcemap: false }),
    ).toMatchObject({ minify: false, sourcemap: false });
  });

  it('resolves custom sourcemap paths when generation is enabled through config', () => {
    const config = createTestConfig('/root/project');
    config.output.sourcemap = true;

    expect(
      resolveBuildOptions(config, { platform: 'ios', sourcemapOutfile: 'maps/index.map' }),
    ).toMatchObject({ sourcemapOutfile: '/root/project/maps/index.map' });
  });
});
