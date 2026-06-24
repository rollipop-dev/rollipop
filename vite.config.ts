import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    printWidth: 100,
    singleQuote: true,
    ignorePatterns: [
      'docs/.next/**',
      'docs/.source/**',
      'docs/out/**',
      'docs/next-env.d.ts',
      'examples/*/android/**',
      'examples/*/ios/**',
      '**/CHANGELOG.md',
      '**/__fixtures__/**',
      '**/.**',
      // package: rollipop
      'packages/rollipop/src/runtime/runtime-utils.ts',
      // package: dashboard
      'packages/dashboard/public/mockServiceWorker.js',
    ],
    experimentalSortImports: {
      groups: [
        ['type-import'],
        ['type-builtin', 'value-builtin'],
        ['type-external', 'value-external', 'type-internal', 'value-internal'],
        [
          'type-parent',
          'type-sibling',
          'type-index',
          'value-parent',
          'value-sibling',
          'value-index',
        ],
        ['unknown'],
      ],
    },
  },
  lint: {
    ignorePatterns: [
      'rolldown/**',
      'docs/**',
      'examples/**',
      '**/__fixtures__/**',
      'packages/dashboard/public/mockServiceWorker.js',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
