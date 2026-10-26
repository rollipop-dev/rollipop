import fs from 'node:fs';
import path from 'node:path';

import { parseSync, Visitor } from 'oxc-parser';
import type { AssignmentExpression, ObjectExpression, ObjectProperty } from 'oxc-parser';

import metadata from '../package.json' with { type: 'json' };

const { version } = metadata;
const RN_CONFIG_FILE = 'react-native.config.js';
const COMMANDS_REQUIRE = "require('rollipop/commands')";

export type SetupResult = 'created' | 'updated' | 'already-configured' | 'manual-required';

export function detectProject(cwd: string): 'bare' | 'expo' {
  const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  return packageJson.dependencies?.expo || packageJson.devDependencies?.expo ? 'expo' : 'bare';
}

export function setupExpoConfig(cwd: string): { status: SetupResult; filename: string } {
  // Match Expo's config precedence without evaluating user configuration.
  const dynamicConfig = ['ts', 'mts', 'cts', 'mjs', 'cjs', 'js']
    .map((extension) => `app.config.${extension}`)
    .find((filename) => fs.existsSync(path.join(cwd, filename)));
  if (dynamicConfig) {
    return { status: 'manual-required', filename: dynamicConfig };
  }

  const filename =
    ['app.config.json', 'app.json'].find((name) => fs.existsSync(path.join(cwd, name))) ??
    'app.json';
  const configPath = path.join(cwd, filename);
  const exists = fs.existsSync(configPath);
  const root = exists ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : { expo: {} };
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error(`${filename} must contain an Expo configuration object`);
  }
  const config = 'expo' in root ? root.expo : root;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${filename}: 'expo' must be an object`);
  }
  const plugins = config.plugins ?? [];
  if (!Array.isArray(plugins)) {
    throw new Error(`${filename}: 'plugins' must be an array`);
  }
  if (plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === '@rollipop/expo')) {
    return { status: 'already-configured', filename };
  }
  config.plugins = [...plugins, '@rollipop/expo'];
  fs.writeFileSync(configPath, JSON.stringify(root, null, 2) + '\n');
  return { status: exists ? 'updated' : 'created', filename };
}

export function setupReactNativeConfig(cwd: string): SetupResult {
  const configPath = path.join(cwd, RN_CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `module.exports = {\n  commands: ${COMMANDS_REQUIRE},\n};\n`);
    return 'created';
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const result = analyzeConfig(content);

  switch (result.status) {
    case 'already-configured':
      return 'already-configured';
    case 'has-other-commands':
      throw new Error(`'commands' property already exists with a different value`);
    case 'not-object-export':
      return 'manual-required';
    case 'injectable': {
      const updated = applyInjection(content, result.insertOffset, result.needsComma);
      fs.writeFileSync(configPath, updated);
      return 'updated';
    }
  }
}

type AnalyzeResult =
  | { status: 'already-configured' }
  | { status: 'has-other-commands' }
  | { status: 'not-object-export' }
  | { status: 'injectable'; insertOffset: number; needsComma: boolean };

function analyzeConfig(content: string): AnalyzeResult {
  const { program, comments } = parseSync('react-native.config.js', content);

  let moduleExportsAssignment: AssignmentExpression | null = null;

  new Visitor({
    AssignmentExpression(node) {
      if (isModuleExports(node)) {
        moduleExportsAssignment = node;
      }
    },
  }).visit(program);

  if (!moduleExportsAssignment) {
    return { status: 'not-object-export' };
  }

  const assignment = moduleExportsAssignment as AssignmentExpression;

  if (assignment.right.type !== 'ObjectExpression') {
    return { status: 'not-object-export' };
  }

  const objectExpr = assignment.right as ObjectExpression;
  const commandsProp = findCommandsProperty(objectExpr);

  if (commandsProp) {
    if (isRollipopCommandsRequire(commandsProp, content)) {
      return { status: 'already-configured' };
    }
    return { status: 'has-other-commands' };
  }

  const properties = objectExpr.properties;
  const lastProp = properties[properties.length - 1];
  const closingBrace = objectExpr.end - 1; // position of '}'

  if (lastProp) {
    const afterLastProp = content.substring(lastProp.end, closingBrace);
    for (const match of afterLastProp.matchAll(/,/g)) {
      const offset = lastProp.end + match.index;
      if (!comments.some((comment) => comment.start <= offset && offset < comment.end)) {
        return {
          status: 'injectable',
          insertOffset: offset + 1,
          needsComma: false,
        };
      }
    }
    return { status: 'injectable', insertOffset: lastProp.end, needsComma: true };
  }

  return { status: 'injectable', insertOffset: closingBrace, needsComma: false };
}

function isModuleExports(node: AssignmentExpression): boolean {
  const left = node.left;
  return (
    left.type === 'MemberExpression' &&
    left.object.type === 'Identifier' &&
    left.object.name === 'module' &&
    left.property.type === 'Identifier' &&
    left.property.name === 'exports'
  );
}

function findCommandsProperty(obj: ObjectExpression): ObjectProperty | null {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as ObjectProperty;
    if (
      (p.key.type === 'Identifier' && p.key.name === 'commands') ||
      (p.key.type === 'Literal' && p.key.value === 'commands')
    ) {
      return p;
    }
  }
  return null;
}

function isRollipopCommandsRequire(prop: ObjectProperty, content: string): boolean {
  const valueSource = content.substring(prop.value.start, prop.value.end);
  return valueSource.includes('rollipop/commands');
}

function applyInjection(content: string, insertOffset: number, needsComma: boolean): string {
  const before = content.substring(0, insertOffset);
  const after = content.substring(insertOffset);
  const comma = needsComma ? ',' : '';
  return `${before}${comma}\n  commands: ${COMMANDS_REQUIRE},${after}`;
}

export function setupPackage(cwd: string) {
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = {
    rollipop: version,
    ...(detectProject(cwd) === 'expo' ? { '@rollipop/expo': version } : {}),
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    ...dependencies,
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  return Object.keys(dependencies);
}
