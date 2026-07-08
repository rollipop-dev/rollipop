---
name: migration
description: Metro-to-Rollipop migration guide. Use when moving a React Native app from Metro to Rollipop, wiring React Native CLI commands, choosing direct npx rollipop usage, translating only necessary Metro config, and running first validation after migration.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(yarn:*), Bash(node:*), Bash(rg:*)
---

# Metro to Rollipop Migration

Use this skill when moving an existing React Native app from Metro to Rollipop.

## Quick Start

Use the quick start when installing Rollipop or wiring the project for the first time: https://rollipop.dev/docs/get-started/quick-start.md.

## Command Path

Choose one command path: React Native CLI override through `react-native.config.js`, or direct Rollipop CLI with `npx rollipop ...`. Read the command reference at https://rollipop.dev/docs/get-started/cli-commands.md.

## Metro Config Translation

Do not copy Metro config wholesale. Translate only the behavior the app actually relies on, and use Rollipop configuration docs for the target option names: https://rollipop.dev/docs/get-started/configuration.md.

## First Validation

After migration, validate both dev-server startup and a real bundle. If validation fails after the migration steps, stop migrating and switch to `troubleshooting.md`.

## Route Next

- Use `configuration.md` for resolve, transform, env, output sourcemap, and optimization changes.
- Use `plugins.md` when Metro transformer or middleware behavior should become a Rollipop plugin.
- Use `troubleshooting.md` for failures after migration or during validation.
