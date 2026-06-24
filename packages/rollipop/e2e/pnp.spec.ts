import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { invariant } from 'es-toolkit';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const MONOREPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const ROLLIPOP_DIR = path.resolve(import.meta.dirname, '..');
const FIXTURE_DIR = path.resolve(import.meta.dirname, '__fixtures__/react-native-app');
const DASHBOARD_WORKSPACE_DIR = 'packages/dashboard';

let tmpDir: string;

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      env: {
        ...process.env,
        COREPACK_ENABLE_STRICT: '0',
        YARN_ENABLE_HARDENED_MODE: '0',
        YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
      },
    }).toString();
  } catch (e: any) {
    const stderr = e.stderr?.toString() ?? '';
    const stdout = e.stdout?.toString() ?? '';
    throw new Error(
      [`Command failed: ${cmd}`, stderr && `stderr: ${stderr}`, stdout && `stdout: ${stdout}`]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function getYarnVersion() {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(MONOREPO_ROOT, 'package.json'), 'utf-8'),
  ) as {
    packageManager?: string;
  };
  const match = rootPkg.packageManager?.match(/yarn@(.+)/);
  invariant(match, 'could not find yarn version in package.json');
  return match[1];
}

function log(message: string) {
  console.log(`[pnp-test] ${message}`);
}

function writeDashboardWorkspaceStub() {
  const dashboardDir = path.join(tmpDir, DASHBOARD_WORKSPACE_DIR);

  fs.mkdirSync(path.join(dashboardDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(dashboardDir, 'package.json'),
    JSON.stringify(
      {
        name: '@rollipop/dashboard',
        version: '0.0.0',
        private: true,
        type: 'module',
        main: 'index.js',
        types: 'index.d.ts',
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(dashboardDir, 'index.js'),
    `
import path from 'node:path';

export const staticPath = path.join(import.meta.dirname, 'dist');
`.trimStart(),
  );
  fs.writeFileSync(
    path.join(dashboardDir, 'index.d.ts'),
    `
declare const staticPath: string;

export { staticPath };
`.trimStart(),
  );
  fs.writeFileSync(path.join(dashboardDir, 'dist/index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(dashboardDir, 'dist/404.html'), '<!doctype html>');
}

beforeAll(() => {
  const yarnVersion = getYarnVersion();
  const nodeVersion = process.version;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-pnp-'));

  log(`Node ${nodeVersion}, Yarn ${yarnVersion}`);
  log(`Project root: ${tmpDir}`);

  // Copy fixture source files
  log('Copying fixture files...');
  for (const file of fs.readdirSync(FIXTURE_DIR)) {
    fs.cpSync(path.join(FIXTURE_DIR, file), path.join(tmpDir, file), { recursive: true });
  }
  writeDashboardWorkspaceStub();

  // Standalone tsconfig
  fs.writeFileSync(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
      },
    }),
  );

  // .yarnrc.yml — PnP strict mode
  // catalogs needed because portal:'d rollipop uses catalog:rolldown references
  const monorepoYarnRc = fs.readFileSync(path.join(MONOREPO_ROOT, '.yarnrc.yml'), 'utf-8');
  const catalogSections = [
    monorepoYarnRc.match(/catalog:[\s\S]*?(?=\n\w|\n$)/)?.[0] ?? '',
    monorepoYarnRc.match(/catalogs:[\s\S]*?(?=\n\w|\n$)/)?.[0] ?? '',
  ];
  const npmPreapprovedPackage =
    monorepoYarnRc.match(/npmPreapprovedPackages:[\s\S]*?(?=\n\w|\n$)/)?.[0] ?? '';

  fs.writeFileSync(
    path.join(tmpDir, '.yarnrc.yml'),
    [
      'nodeLinker: pnp',
      'enableGlobalCache: false',
      'npmMinimalAgeGate: 7d',
      '',
      ...catalogSections,
      npmPreapprovedPackage,
    ].join('\n') + '\n',
  );

  // package.json — minimal deps with portal: link to rollipop
  const examplePkg = JSON.parse(
    fs.readFileSync(path.join(MONOREPO_ROOT, 'examples/0.84/package.json'), 'utf-8'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify(
      {
        name: 'rollipop-pnp-test',
        private: true,
        packageManager: `yarn@${yarnVersion}`,
        workspaces: [DASHBOARD_WORKSPACE_DIR],
        dependencies: {
          react: examplePkg.dependencies['react'],
          'react-native': examplePkg.dependencies['react-native'],
        },
        devDependencies: {
          rollipop: `portal:${ROLLIPOP_DIR}`,
          '@react-native/babel-preset': examplePkg.devDependencies['@react-native/babel-preset'],
          '@babel/core': examplePkg.devDependencies['@babel/core'],
          '@babel/runtime': examplePkg.devDependencies['@babel/runtime'],
          typescript: examplePkg.devDependencies['typescript'],
        },
      },
      null,
      2,
    ),
  );

  // Build script — runs under PnP context via `corepack yarn node`
  fs.writeFileSync(
    path.join(tmpDir, 'build-test.mjs'),
    `
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const { loadConfig } = await import('rollipop');
  const { Bundler } = await import('rollipop');

  const config = await loadConfig({ cwd: process.cwd(), mode: 'production' });
  config.entry = path.resolve(config.root, config.entry);

  const bundler = new Bundler(config);
  const chunk = await bundler.build({ platform: 'ios', dev: false, cache: false });

  fs.writeFileSync('build-result.json', JSON.stringify({
    success: true,
    codeLength: chunk.code.length,
    // User code
    hasAppRegistry: chunk.code.includes('AppRegistry'),
    // Default prelude (InitializeCore from react-native)
    hasInitializeCore: chunk.code.includes('InitializeCore'),
    // Built-in defines & global variables
    hasDevFalse: chunk.code.includes('var __DEV__ = false'),
    hasBundleStartTime: chunk.code.includes('__BUNDLE_START_TIME__'),
    hasNodeEnv: chunk.code.includes('process.env.NODE_ENV'),
    // Default polyfills from react-native (injected as IIFE)
    hasPolyfillIIFE: /\\(function\\s*\\(global\\)/.test(chunk.code),
  }));
}

main().catch(err => {
  fs.writeFileSync('build-result.json', JSON.stringify({
    success: false,
    error: err.message,
    stack: err.stack,
  }));
  process.exit(1);
});
`.trimStart(),
  );

  // Ensure corepack is enabled and yarn version is prepared (CI may not have it active)
  log('Setting up corepack...');
  exec(`corepack enable`, tmpDir);
  exec(`corepack prepare yarn@${yarnVersion} --activate`, tmpDir);

  // Create empty yarn.lock (CI hardened mode blocks lockfile creation)
  fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');

  // Install dependencies under PnP strict mode
  log('Installing dependencies (PnP strict)...');
  exec('yarn install', tmpDir);
  log('Setup complete.');
}, 300_000);

afterAll(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Yarn PnP', () => {
  it('builds a React Native bundle under PnP strict resolution', () => {
    log('Running build under PnP...');
    exec('yarn node build-test.mjs', tmpDir);

    const resultPath = path.join(tmpDir, 'build-result.json');
    expect(fs.existsSync(resultPath)).toBe(true);

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));

    if (!result.success) {
      throw new Error(`Build failed: ${result.error}\n${result.stack ?? ''}`);
    }

    expect(result.codeLength).toBeGreaterThan(1000);
    // User code bundled
    expect(result.hasAppRegistry).toBe(true);
    // Default prelude (react-native InitializeCore)
    expect(result.hasInitializeCore).toBe(true);
    // Built-in defines & global variables
    expect(result.hasDevFalse).toBe(true);
    expect(result.hasBundleStartTime).toBe(true);
    expect(result.hasNodeEnv).toBe(true);
    // Default polyfills from react-native
    expect(result.hasPolyfillIIFE).toBe(true);
  }, 300_000);
});
