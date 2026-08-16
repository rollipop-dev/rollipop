import { createRequire } from 'node:module';
import path from 'node:path';

import type { Config, ResolveConfig } from '../config/types';

/**
 * The value of `process.env.EXPO_BUNDLER` that activates Rollipop's Expo
 * compatibility mode. Set by `@expo/cli` when `expo start --bundler rollipop`
 * (or `ios.bundler: 'rollipop'` in app.json) is used.
 */
export const EXPO_BUNDLER_ENV = 'rollipop';

export interface ExpoConfigTranslationResult {
  /** The raw `@expo/metro-config` output, or `null` if it could not be loaded. */
  metroConfig: Record<string, any> | null;
  /** Partial Rollipop config derived from the Metro config. */
  rollipopConfig: Partial<Config>;
  /** Notes about fields that could not be translated 1:1. */
  warnings: string[];
}

/**
 * Translate an `@expo/metro-config` output object into a Rollipop config
 * override.
 *
 * Expo projects are configured via `expo/metro-config`'s `getDefaultConfig`.
 * Rollipop does not run Metro, so we read that config and map the fields it
 * controls (aliases, asset/source extensions, asset redirects) onto Rollipop's
 * own resolver. Nothing here shells out to Metro.
 *
 * The result is designed to be merged *over* Rollipop's default config (array
 * fields such as `assetExtensions` are unioned with the defaults by
 * `mergeConfig`).
 */
export function translateExpoMetroConfig(metroConfig: Record<string, any>): {
  config: Partial<Config>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const resolve: Partial<ResolveConfig> = {};

  const resolver = (metroConfig.resolver ?? {}) as Record<string, any>;

  // `resolver.alias` -> `resolve.alias`
  if (resolver.alias && typeof resolver.alias === 'object') {
    resolve.alias = resolver.alias as ResolveConfig['alias'];
  }

  // `resolver.assetExts` -> `resolve.assetExtensions`
  if (Array.isArray(resolver.assetExts) && resolver.assetExts.length > 0) {
    resolve.assetExtensions = resolver.assetExts as string[];
  }

  // `resolver.sourceExts` -> `resolve.sourceExtensions`
  if (Array.isArray(resolver.sourceExts) && resolver.sourceExts.length > 0) {
    resolve.sourceExtensions = resolver.sourceExts as string[];
  }

  // `resolver.assetRedirects` has no native Rolldown equivalent; approximate it
  // as object aliases so redirected asset requests resolve to the target file.
  // NOTE: this is lossy — Metro's assetRedirects supports glob/regex keys and
  // richer matching that a flat alias map cannot express. Tracked as a known
  // limitation; the caller surfaces this warning.
  if (resolver.assetRedirects && typeof resolver.assetRedirects === 'object') {
    resolve.alias = {
      ...(resolve.alias as Record<string, string> | undefined),
      ...(resolver.assetRedirects as Record<string, string>),
    } as ResolveConfig['alias'];
    warnings.push(
      'Metro `resolver.assetRedirects` was approximated as flat module aliases; ' +
        'glob/regex redirect keys are not supported and may resolve incorrectly.',
    );
  }

  // Metro's `transformer` (babel presets, etc.) has no direct Rollipop
  // equivalent — Rollipop uses its own React Native transform pipeline.
  if (metroConfig.transformer && Object.keys(metroConfig.transformer).length > 0) {
    warnings.push(
      'Metro `transformer` options were ignored; Rollipop uses its own React Native transform pipeline.',
    );
  }

  const rollipopConfig: Partial<Config> = {};
  if (Object.keys(resolve).length > 0) {
    rollipopConfig.resolve = resolve as ResolveConfig;
  }

  return { config: rollipopConfig, warnings };
}

/**
 * Load the Expo Metro config from the project root and translate it into a
 * Rollipop config override.
 *
 * `@expo/metro-config` is resolved relative to `projectRoot` (the Expo app), not
 * from Rollipop's own dependencies, so this works for any app that has Expo
 * installed. When the package cannot be resolved or evaluated, a non-fatal
 * result with an empty override is returned and the caller keeps the default
 * Rollipop config.
 */
export async function getExpoRolipopConfig(
  projectRoot: string,
): Promise<ExpoConfigTranslationResult> {
  const warnings: string[] = [];
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));

  // Surface translation warnings to the user. Callers (e.g. the dev server) may
  // also read `result.warnings`, but warnings must not be silently swallowed —
  // a dropped Metro config field that changes bundle behavior is exactly the kind
  // of thing the user needs to see.
  const emitWarning = (message: string): void => {
    warnings.push(message);
    console.warn(`[rollipop:expo-config] ${message}`);
  };

  let getDefaultConfig: ((projectRoot: string, options?: Record<string, any>) => any) | undefined;
  let resolved: string | undefined;
  try {
    resolved = projectRequire.resolve('@expo/metro-config');
  } catch {
    // `@expo/metro-config` may not be hoisted into the consuming app's
    // node_modules (e.g. pnpm strict mode). Prefer an explicit path supplied
    // by the Expo CLI (which passes the resolved location of its own
    // `@expo/metro-config` dependency), then fall back to Rollipop's own
    // location, so Expo compatibility works without a symlink in the app.
    const fromEnv = process.env.ROLLIPOP_EXPO_METRO_CONFIG;
    if (fromEnv) {
      resolved = fromEnv;
    } else {
      try {
        const selfRequire = createRequire(import.meta.url);
        resolved = selfRequire.resolve('@expo/metro-config');
      } catch {
        resolved = undefined;
      }
    }
  }
  if (!resolved) {
    return {
      metroConfig: null,
      rollipopConfig: {},
      warnings: ['@expo/metro-config is not resolvable from the project root.'],
    };
  }
  try {
    const mod = await import(resolved);
    getDefaultConfig = mod.getDefaultConfig ?? mod.default?.getDefaultConfig;
  } catch {
    return {
      metroConfig: null,
      rollipopConfig: {},
      warnings: ['@expo/metro-config is not resolvable from the project root.'],
    };
  }

  if (typeof getDefaultConfig !== 'function') {
    return {
      metroConfig: null,
      rollipopConfig: {},
      warnings: ['@expo/metro-config does not export `getDefaultConfig`.'],
    };
  }

  let metroConfig: Record<string, any>;
  try {
    metroConfig = getDefaultConfig(projectRoot, {});
  } catch (error) {
    warnings.push(`Failed to evaluate the Expo Metro config: ${(error as Error).message}`);
    return { metroConfig: null, rollipopConfig: {}, warnings };
  }

  const { config: rollipopConfig, warnings: translationWarnings } =
    translateExpoMetroConfig(metroConfig);
  for (const w of translationWarnings) {
    emitWarning(w);
  }
  return { metroConfig, rollipopConfig, warnings };
}

/** Whether Rollipop should load the Expo config translator. */
export function isExpoBundlerMode(): boolean {
  return process.env.EXPO_BUNDLER === EXPO_BUNDLER_ENV;
}
