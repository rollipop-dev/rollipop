---
name: configuration
description: Rollipop configuration workflow. Use for rollipop.config.ts, defineConfig, resolve, transform, output, React Native options, env files, sourcemaps, optimization, terminal, reporter, and experimental options.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(yarn:*), Bash(node:*)
---

# Rollipop Configuration

Use this skill when the task changes `rollipop.config.ts` or depends on resolved config.

## Configuration Reference

Read https://rollipop.dev/docs/get-started/configuration.md before adding or renaming options. Keep config minimal and preserve defaults unless the app has a concrete need to override them.

## Environment Variables

Use https://rollipop.dev/docs/features/env.md when changing env file loading, prefixes, mode-specific values, or `import.meta.env` typing.

## Experimental Features

Use https://rollipop.dev/docs/features/experimental.md before enabling experimental options. Keep the change explicit and mention stability/version risk. For worklets specifically, read https://rollipop.dev/docs/features/reanimated-worklets.md.

## Resolve Changes

When changing module resolution behavior, verify package metadata (`exports`, `react-native`, `browser`, `main`) before adding aliases or externals. Prefer resolve/config APIs over final `rolldownOptions` overrides.

## Watchpoints

- Translate intent from existing Metro config instead of copying Metro fields mechanically.
- Overriding arrays can accidentally remove React Native defaults; check docs before replacing prelude or resolve extension lists.
- If config is produced dynamically, inspect both the source config and the resolved behavior through dev-server diagnostics when available.
