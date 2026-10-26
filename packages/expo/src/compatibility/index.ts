import { createRequire } from 'node:module';
import path from 'node:path';

import { parse, satisfies } from 'semver';

import { createExpoCli } from './cli';

const strategies = [
  { range: '>=55 <56', winterEntry: 'expo/src/winter/index.ts', hermesV1: false },
  { range: '>=56 <58', winterEntry: 'expo/src/winter/index.ts', hermesV1: true },
  { range: '>=58 <59', winterEntry: 'expo/build/winter', hermesV1: true },
];

export interface ExpoCompatibility {
  projectRoot: string;
  sdkVersion: string;
  cliVersion: string;
  expoRequire: NodeRequire;
  winterEntry: string;
  defaultRuntimeTarget: 'hermes' | 'hermes-v1';
  cli: ReturnType<typeof createExpoCli>;
}

// Select the SDK policy once per registered project; feature modules consume the resolved contract.
export function resolveExpoCompatibility(projectRoot: string): ExpoCompatibility {
  const root = path.resolve(projectRoot);
  const appRequire = createRequire(path.join(root, 'package.json'));
  const expoRequire = createRequire(appRequire.resolve('expo/package.json'));
  const sdkVersion: string = appRequire('expo/package.json').version;
  const cliVersion: string = expoRequire('@expo/cli/package.json').version;
  const sdk = parse(sdkVersion);
  const strategy = strategies.find(({ range }) => satisfies(sdkVersion, range));
  if (!sdk || !strategy || !satisfies(cliVersion, `>=${sdk.major}.0.0 <${sdk.major + 1}.0.0`)) {
    throw new Error(
      `@rollipop/expo requires Expo SDK 55–58 with a matching @expo/cli major; found expo ${sdkVersion}, CLI ${cliVersion}`,
    );
  }
  return {
    projectRoot: root,
    sdkVersion,
    cliVersion,
    expoRequire,
    winterEntry: appRequire.resolve(strategy.winterEntry),
    defaultRuntimeTarget: strategy.hermesV1 ? 'hermes-v1' : 'hermes',
    cli: createExpoCli(expoRequire, cliVersion),
  };
}
