# Documentation

Next.js and Fumadocs site. Run commands from the repository root:

```bash
yarn docs:dev
yarn docs:build
```

The development server runs at `http://localhost:3000`. Builds export to `docs/out` and generate plain Markdown copies of each page.

## Content

- `content/docs/**/*.mdx`: public documentation.
- `content/docs/**/meta.json`: navigation labels and page order.
- `source.config.ts`: MDX schema and processing.
- `src/lib/source.ts`: page loader.
- `src/app/llms.txt/route.ts`: Markdown page index.
- `src/app/llms-full.txt/route.ts`: combined documentation.

Keep examples aligned with package source types and defaults. When removing a page, update navigation and incoming links, including bundled guides in `packages/rollipop/skills`.

## Checks

```bash
yarn vp fmt docs/content/docs --check
yarn workspace docs exec fumadocs-mdx
yarn workspace docs exec tsc --noEmit
yarn docs:build
```

Run generation and checks sequentially; Next.js commands share generated files. Production builds download the Inter font from Google Fonts.
