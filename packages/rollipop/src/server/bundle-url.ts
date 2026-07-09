import type { ResolvedBuildOptions } from '../utils/build-options';

type BundleUrlBuildOptions = Pick<ResolvedBuildOptions, 'dev' | 'minify' | 'platform'>;

export function getBundleQuery(buildOptions: BundleUrlBuildOptions) {
  return new URLSearchParams({
    platform: buildOptions.platform,
    dev: String(buildOptions.dev),
    minify: String(
      typeof buildOptions.minify === 'boolean' ? buildOptions.minify : Boolean(buildOptions.minify),
    ),
  });
}

export function getBundleUrl(
  serverBaseUrl: string,
  bundleEntry: string,
  buildOptions: BundleUrlBuildOptions,
) {
  return new URL(`${bundleEntry}.bundle?${getBundleQuery(buildOptions).toString()}`, serverBaseUrl);
}

export function getBundleSourceMapUrl(
  serverBaseUrl: string,
  bundleEntry: string,
  buildOptions: BundleUrlBuildOptions,
) {
  return new URL(`${bundleEntry}.map?${getBundleQuery(buildOptions).toString()}`, serverBaseUrl);
}
