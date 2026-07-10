import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resetCache: vi.fn(),
  runBuild: vi.fn(),
}));

vi.mock('../../../../config', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../../../../utils/reset-cache', () => ({ resetCache: mocks.resetCache }));
vi.mock('../../../../utils/run-build', () => ({ runBuild: mocks.runBuild }));

import { action } from '../action';

describe('bundle command action', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('enables sourcemap generation when sourcemap-output is provided', async () => {
    const config = { entry: 'index.js' };
    mocks.loadConfig.mockResolvedValue(config);
    mocks.runBuild.mockResolvedValue({});

    await action.call(
      { platforms: ['android', 'ios'] },
      {
        platform: 'android',
        dev: false,
        bundleOutput: 'dist/index.android.bundle',
        sourcemapOutput: 'dist/index.android.bundle.map',
        resetCache: false,
        sourcemapUseAbsolutePath: false,
        entryFile: 'index.js',
      },
    );

    expect(mocks.runBuild).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        outfile: 'dist/index.android.bundle',
        sourcemap: true,
        sourcemapOutfile: 'dist/index.android.bundle.map',
      }),
    );

    expect(config.entry).toBe(path.resolve(process.cwd(), 'index.js'));
  });

  it('does not enable sourcemaps when sourcemap-output is omitted', async () => {
    const config = { entry: 'index.js' };
    mocks.loadConfig.mockResolvedValue(config);
    mocks.runBuild.mockResolvedValue({});

    await action.call(
      { platforms: ['android', 'ios'] },
      {
        platform: 'android',
        dev: false,
        bundleOutput: 'dist/index.android.bundle',
        resetCache: false,
        sourcemapUseAbsolutePath: false,
        entryFile: 'index.js',
      },
    );

    const [, buildOptions] = mocks.runBuild.mock.calls[0];
    expect(buildOptions).not.toHaveProperty('sourcemap');
    expect(buildOptions).toEqual(
      expect.objectContaining({
        outfile: 'dist/index.android.bundle',
        sourcemapOutfile: undefined,
      }),
    );
  });
});
