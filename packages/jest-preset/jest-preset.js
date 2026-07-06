const path = require('node:path');

const projectRoot = process.cwd();

function requireFromProjectRoot(id) {
  return require(require.resolve(id, { paths: [projectRoot] }));
}

function loadBasePreset() {
  try {
    return {
      preset: requireFromProjectRoot('@react-native/jest-preset'),
      setup: '@react-native/jest-preset/setup.js',
    };
  } catch {}

  try {
    return {
      preset: requireFromProjectRoot('react-native/jest-preset'),
      setup: 'react-native/jest/setup.js',
    };
  } catch {}

  throw new Error(
    '@rollipop/jest-preset: could not resolve a React Native jest preset. ' +
      'Install either `@react-native/jest-preset` (RN >= 0.85) or `react-native` (RN <= 0.84).',
  );
}

const { preset, setup } = loadBasePreset();

module.exports = {
  ...preset,
  setupFiles: [setup],
  transform: Object.fromEntries(
    Object.entries(preset.transform ?? {}).map(([key, value]) =>
      // Replace 'babel-jest' with our transformer.
      value === 'babel-jest' ? [key, path.join(__dirname, 'dist', 'transformer.js')] : [key, value],
    ),
  ),
};
