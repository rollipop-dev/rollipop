import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { setupXcodeEnv } from '../init';

describe('setupXcodeEnv', () => {
  let tmpDir: string;
  let projectRoot: string;
  let iosDir: string;
  let envPath: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-init-xcode-')));
    projectRoot = path.join(tmpDir, 'App With Spaces');
    iosDir = path.join(projectRoot, 'ios');
    envPath = path.join(iosDir, '.xcode.env');
    fs.mkdirSync(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createIos() {
    fs.mkdirSync(iosDir);
  }

  function createRollipop(root: string) {
    const cliPath = path.join(root, 'node_modules/rollipop/bin/index.js');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.writeFileSync(cliPath, '');
    return cliPath;
  }

  function sourceEnv(local = false, inheritedCliPath = '') {
    return execFileSync(
      '/bin/sh',
      [
        '-c',
        `. "$1"; ${local ? '. "$2";' : ''} printf '%s\\n%s\\n%s' "$CLI_PATH" "$NODE_BINARY" "$PWD"`,
        'sh',
        envPath,
        `${envPath}.local`,
      ],
      {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: '/nonexistent',
          PROJECT_DIR: iosDir,
          CLI_PATH: inheritedCliPath,
          NODE_BINARY: '',
        },
      },
    ).split('\n');
  }

  it('skips projects without ios without creating native files', () => {
    expect(setupXcodeEnv(projectRoot)).toBe('skipped');
    expect(fs.existsSync(iosDir)).toBe(false);
  });

  it('creates configuration before dependencies are installed and is idempotent', () => {
    createIos();

    expect(setupXcodeEnv(projectRoot)).toBe('created');
    const generated = fs.readFileSync(envPath, 'utf8');
    expect(setupXcodeEnv(projectRoot)).toBe('already-configured');
    expect(fs.readFileSync(envPath, 'utf8')).toBe(generated);

    const cliPath = createRollipop(projectRoot);
    expect(sourceEnv()).toEqual([cliPath, '', tmpDir]);
  });

  it.each(['standard', 'hoisted'])('finds %s dependencies in paths containing spaces', (layout) => {
    createIos();
    setupXcodeEnv(projectRoot);
    const cliPath = createRollipop(layout === 'standard' ? projectRoot : tmpDir);

    expect(sourceEnv()).toEqual([cliPath, '', tmpDir]);
  });

  it.each(['\n', '\r\n', ''])('preserves existing content ending with %j', (ending) => {
    createIos();
    const previous = `# Custom settings\r\nexport NODE_BINARY="/custom/node"${ending}`;
    fs.writeFileSync(envPath, previous);

    expect(setupXcodeEnv(projectRoot)).toBe('updated');
    const updated = fs.readFileSync(envPath, 'utf8');
    expect(updated.startsWith(previous)).toBe(true);
    expect(setupXcodeEnv(projectRoot)).toBe('already-configured');
    expect(fs.readFileSync(envPath, 'utf8')).toBe(updated);
  });

  it('keeps local Node settings intact and lets them override the base environment', () => {
    createIos();
    fs.writeFileSync(envPath, 'export NODE_BINARY="/base/node"\n');
    const local = 'export NODE_BINARY="/local/node with spaces"\n';
    fs.writeFileSync(`${envPath}.local`, local);

    expect(setupXcodeEnv(projectRoot)).toBe('updated');
    const cliPath = createRollipop(projectRoot);
    expect(sourceEnv(true)).toEqual([cliPath, '/local/node with spaces', tmpDir]);
    expect(fs.readFileSync(`${envPath}.local`, 'utf8')).toBe(local);
  });

  it('preserves CLI_PATH inherited from the Xcode environment', () => {
    createIos();
    setupXcodeEnv(projectRoot);
    createRollipop(projectRoot);

    expect(sourceEnv(false, '/custom cli/index.js')).toEqual(['/custom cli/index.js', '', tmpDir]);
  });

  it('recognizes the existing documented Rollipop entry point without changing it', () => {
    createIos();
    const previous = 'export CLI_PATH="$PROJECT_DIR/../node_modules/rollipop/bin/index.js"\n';
    fs.writeFileSync(envPath, previous);

    expect(setupXcodeEnv(projectRoot)).toBe('already-configured');
    expect(fs.readFileSync(envPath, 'utf8')).toBe(previous);
  });

  it.each(['base', 'local', 'project'])(
    'preserves a custom CLI_PATH in %s configuration',
    (source) => {
      createIos();
      const previous = '# Existing configuration\nexport NODE_BINARY="/custom/node"\n';
      const local = '# Local overrides\n';
      fs.writeFileSync(envPath, previous);
      fs.writeFileSync(`${envPath}.local`, local);
      const custom = 'export CLI_PATH="$PROJECT_DIR/custom-cli.js"\n';
      let projectPath: string | undefined;
      if (source === 'base') {
        fs.appendFileSync(envPath, custom);
      } else if (source === 'local') {
        fs.appendFileSync(`${envPath}.local`, custom);
      } else {
        projectPath = path.join(iosDir, 'App.xcodeproj/project.pbxproj');
        fs.mkdirSync(path.dirname(projectPath));
        fs.writeFileSync(
          projectPath,
          'shellScript = "export CLI_PATH=\\"$PROJECT_DIR/custom-cli.js\\"\\n";\n',
        );
      }
      const baseBefore = fs.readFileSync(envPath, 'utf8');
      const localBefore = fs.readFileSync(`${envPath}.local`, 'utf8');
      const projectBefore = projectPath && fs.readFileSync(projectPath, 'utf8');

      expect(setupXcodeEnv(projectRoot)).toBe('manual-required');
      expect(fs.readFileSync(envPath, 'utf8')).toBe(baseBefore);
      expect(fs.readFileSync(`${envPath}.local`, 'utf8')).toBe(localBefore);
      if (projectPath) expect(fs.readFileSync(projectPath, 'utf8')).toBe(projectBefore);
    },
  );

  it('ignores comments mentioning CLI_PATH', () => {
    createIos();
    const previous = '# export CLI_PATH="/custom/cli.js"\n# CLI_PATH is configured below.\n';
    fs.writeFileSync(envPath, previous);

    expect(setupXcodeEnv(projectRoot)).toBe('updated');
    expect(fs.readFileSync(envPath, 'utf8').startsWith(previous)).toBe(true);
    const cliPath = createRollipop(projectRoot);
    expect(sourceEnv()).toEqual([cliPath, '', tmpDir]);
  });
});
