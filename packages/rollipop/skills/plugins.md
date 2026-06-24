---
name: plugins
description: Rollipop plugin workflow. Use for adding plugins, writing plugins, plugin ordering, hook filters, configureServer, client-server HMR communication, reporters, SVG/analyze/module-federation plugins, and plugin debugging.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(yarn:*), Bash(node:*)
---

# Rollipop Plugins

Use this skill for plugin configuration or plugin implementation.

## Plugin API

Read https://rollipop.dev/docs/apis/plugin.md before adding hooks or relying on hook ordering. Use hook filters for transforms that only apply to specific files, and use `configureServer` only for development-server behavior.

## First-party Plugins

### SVG

Use the SVG plugin when `.svg` imports should become React components rather than static assets. Read https://rollipop.dev/docs/features/svg.md.

### Module Federation

Module federation is an early-stage feature. Preserve the host-vs-remote role split and validate against the example app when relevant. Read https://rollipop.dev/docs/features/module-federation.md.

### Bundle Analysis

Use the built-in analyzer config when the task is to inspect bundle size or module composition. Read https://rollipop.dev/docs/features/analyze.md.

### Rozenite

Use the Rozenite plugin when the app needs Rozenite DevTools middleware integrated into the Rollipop dev server. Keep it development-focused and follow Rozenite's app-side setup guidance for companion plugins. Read https://www.rozenite.dev.

## Watchpoints

- Use existing ecosystem plugins before writing app-local plugin code.
- Keep plugin config small and explicit; avoid embedding broad app behavior in plugins unless the task needs it.
- For plugin failures, use `troubleshooting.md` first; use `debugging.md` to inspect build logs/events before widening the plugin surface.
