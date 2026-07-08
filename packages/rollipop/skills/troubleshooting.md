---
name: troubleshooting
description: Rollipop issue-response guide. Use for build failures, post-migration resolver errors, package exports or mainFields problems, optional require failures, cache suspicion, HMR failures, and deciding whether to inspect diagnostics, change config, externalize a package, or route to debugging tools.
allowed-tools: Bash(npx:*), Bash(npm:*), Bash(pnpm:*), Bash(rollipop:*), Bash(curl:*), Bash(yarn:*), Bash(node:*), Bash(rg:*)
---

# Rollipop Troubleshooting

Use this skill when something fails and the task is to decide what kind of fix is appropriate.

## Troubleshooting Guide

Start with the official troubleshooting guide for debug logging and issue-report context: https://rollipop.dev/docs/troubleshooting.md.

## Diagnostics

Use `debugging.md` when the next step is collecting MCP/SSE/build-log/app-log/symbolication data. MCP details are in https://rollipop.dev/docs/features/mcp.md and SSE details are in https://rollipop.dev/docs/features/sse.md.

## Configuration

Use `configuration.md` when the fix is likely a resolve, transform, env, output sourcemap, optimization, or top-level `external` change. The config reference is https://rollipop.dev/docs/get-started/configuration.md.

## Resolution Failures

Rollipop uses stricter standard package resolution than Metro. For a failing specifier, inspect the package's `package.json` and verify `exports`, `react-native`, `browser`, `main`, and requested subpaths. Change `resolve.mainFields` only when package metadata supports the intended entry.

## Optional Require Failures

Metro-era probes like `try { require('some-optional-package') } catch { ... }` can still fail at Rollipop bundle time because the `require` is statically resolved. Install required dependencies; externalize the exact specifier through top-level `external` only when runtime fallback is intentional.

## Agent Direction

- Classify the failure before editing: command wiring, config translation, resolver metadata, optional dependency probing, transform/plugin behavior, cache state, HMR, or app runtime behavior.
- Gather a focused repro and fresh logs before widening the change.
- Prefer the smallest source/config/package-metadata fix that explains the observed failure.
- Avoid broad aliases, broad externals, or cache resets unless the evidence points there.
