export const GLOB_IMPORT_HELPERS = {
  cjs: `require('@rollipop/jest-preset/mock').createGlobImport(__filename);`,
  esm: `import.meta.jest.requireActual('@rollipop/jest-preset/mock').createGlobImport(import.meta.jest.requireActual("node:url").fileURLToPath(import.meta.url));`,
};
