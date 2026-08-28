---
name: dev-server
description: Rollipop dev server workflow. Use for rollipop start, HMR, React Native DevTools, ports, HTTPS, interactive mode, Devframe MCP setup, custom terminal commands, and programmatic runServer usage.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(curl:*), Bash(yarn:*), Bash(node:*)
---

# Rollipop Dev Server

Use this skill for development-server behavior, not production bundle output.

## Start Command

Read https://rollipop.dev/docs/get-started/cli-commands.md before selecting `rollipop start` flags. Check whether the project uses React Native CLI commands or direct Rollipop CLI before changing scripts.

## Dev Server Features

Use Rollipop's dev server for React Native HMR, source maps, multi-platform development, and dev tooling integration. Read https://rollipop.dev/docs/features/dev-server.md.

## MCP Server

The Devframe MCP endpoint is available whenever the dev server is running. Read https://rollipop.dev/docs/features/mcp.md.

## Interactive Tools

React Native DevTools and custom terminal commands belong to the dev-server workflow. Read https://rollipop.dev/docs/features/devtools.md and https://rollipop.dev/docs/features/custom-command.md.

## Watchpoints

- Keep server options consistent with device/app URLs: host, port, HTTPS, key, and cert must match the running target.
- Interactive mode is useful for humans; disable it for automation when needed.
- If dev-server startup or HMR fails, switch to `troubleshooting.md`; use `debugging.md` when diagnostics tooling is needed.
