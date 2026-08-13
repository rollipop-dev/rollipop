---
name: debugging
description: Rollipop diagnostics workflow. Use for build failures, HMR failures, runtime app logs, Devframe MCP event inspection, symbolication, bundleFilePath inspection, cache resets, and agent-oriented debugging.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(curl:*), Bash(yarn:*), Bash(node:*)
---

# Rollipop Debugging

Use this skill when Rollipop is installed or running and the task needs diagnostic tooling.

## MCP Server

Devframe MCP exposes structured Rollipop diagnostics whenever the dev server is running. Use it for build events, logs, cache actions, app logs, device status, reloads, build info, and symbolication. Read https://rollipop.dev/docs/features/mcp.md.

## React Native DevTools

Use React Native DevTools for app runtime inspection such as console, sources, network, performance, memory, and React component tooling. Read https://rollipop.dev/docs/features/devtools.md.

## Agent Direction

- Start with a focused repro and fresh diagnostics. Clear stale buffers only when they would confuse the current observation.
- Separate bundler diagnostics from app runtime logs. Build errors, HMR failures, and client logs answer different questions.
- Use `bundleFilePath` only for temporary bundle-level inspection or hypothesis testing; move real fixes back to source/config/plugin code.
- For simulator, emulator, or physical device operation, use the device workflow; Rollipop diagnostics do not replace device automation.

## Watchpoints

- Do not reset cache as the first fix unless stale cache is plausible.
- HMR failures may not change the main bundle status; inspect HMR-specific events/logs.
- If the next step is deciding what to change, route back to `troubleshooting.md`.
