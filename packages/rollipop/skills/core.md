---
name: core
description: Basic Rollipop usage guide. Use for first-pass setup, Metro migration orientation, CLI orientation, and choosing the next Rollipop skill before configuring builds, dev server behavior, troubleshooting, diagnostics, or plugins.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(yarn:*), Bash(node:*)
---

# Rollipop Core

Use this as the first stop for Rollipop tasks. Keep the skill lean: use it to orient, then route to the narrower skill.

## Docs Index

Use https://rollipop.dev/llms.txt as the documentation entrypoint. It lists every official Rollipop `.md` document.

## Project Orientation

Work from the React Native project root unless the user gives another directory. Inspect `package.json`, `react-native.config.js`, `rollipop.config.ts`, and current scripts before changing behavior.

## Rollipop Role

Treat Rollipop as a Metro replacement for React Native, not as a generic web bundler. Use documented Rollipop config and plugin APIs before reaching for final `rolldownOptions` overrides. For the product overview, read https://rollipop.dev/docs/get-started/introduction.md.

## Route Next

- Use `migration.md` for moving a React Native app from Metro to Rollipop.
- Use `troubleshooting.md` for post-migration failures, resolver/package metadata issues, optional require failures, or deciding the fix category.
- Use `build.md` for `rollipop bundle`, production output, sourcemaps, assets, cache behavior, or programmatic `runBuild`.
- Use `dev-server.md` for `rollipop start`, HMR, ports, HTTPS, interactive mode, or programmatic `runServer`.
- Use `debugging.md` for MCP/SSE diagnostics, app logs, build logs, symbolication, or cache triage.
- Use `configuration.md` for `rollipop.config.ts`, resolve/transform/output/env/optimization options, or React Native-specific config.
- Use `plugins.md` for plugin setup, plugin authoring, SVG/analyze/module federation, reporter integration, or client-server plugin communication.
