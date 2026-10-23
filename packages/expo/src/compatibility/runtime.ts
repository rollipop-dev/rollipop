import fs from 'node:fs';
import path from 'node:path';

import type { AppConfig } from '../types';
import type { ExpoCompatibility } from './index';

function boolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
}

export function resolveRuntimeTarget(
  compatibility: ExpoCompatibility,
  exp: AppConfig,
): 'hermes' | 'hermes-v1' {
  const { projectRoot, defaultRuntimeTarget } = compatibility;
  const defaults = defaultRuntimeTarget === 'hermes-v1';
  let ios = defaults;
  let android = defaults;
  for (const plugin of exp.plugins ?? []) {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') continue;
    const options = plugin[1];
    ios = boolean(options?.ios?.useHermesV1) ?? boolean(options?.useHermesV1) ?? ios;
    android = boolean(options?.android?.useHermesV1) ?? boolean(options?.useHermesV1) ?? android;
  }
  const podfile = path.join(projectRoot, 'ios/Podfile.properties.json');
  if (fs.existsSync(podfile)) {
    ios = boolean(JSON.parse(fs.readFileSync(podfile, 'utf8'))['expo.useHermesV1']) ?? ios;
  }
  const gradle = path.join(projectRoot, 'android/gradle.properties');
  if (fs.existsSync(gradle)) {
    const values = [
      ...fs.readFileSync(gradle, 'utf8').matchAll(/^\s*hermesV1Enabled\s*=\s*(\S+)\s*$/gm),
    ];
    android = boolean(values.at(-1)?.[1]) ?? android;
  }
  ios = boolean(process.env.RCT_HERMES_V1_ENABLED) ?? ios;
  android = boolean(process.env.ORG_GRADLE_PROJECT_hermesV1Enabled) ?? android;
  // A dev server serves both platforms. Classic Hermes syntax also runs on V1 when engines differ.
  return ios && android ? 'hermes-v1' : 'hermes';
}
