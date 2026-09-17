import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';

const EXEC_OPTIONS: ExecSyncOptionsWithStringEncoding = {
  // https://yarnpkg.com/advanced/lifecycle-scripts#environment-variables
  cwd: process.env.PROJECT_CWD,
  timeout: 300_000,
  encoding: 'utf-8',
};

export function setup() {
  console.log('Setting up test environment...');
  execSync('yarn build:all', EXEC_OPTIONS);
  execSync('yarn workspace example-0.84 devtools:build', EXEC_OPTIONS);
  console.log();
}
