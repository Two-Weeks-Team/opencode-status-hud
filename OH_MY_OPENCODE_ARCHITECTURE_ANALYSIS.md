# oh-my-opencode Architecture Analysis

## Purpose

This document summarizes how `oh-my-opencode` is architected on top of OpenCode plugin hooks, and where it can be used as a reference pattern for a standalone universal HUD plugin.

## 1) Bootstrap and Composition Pipeline

Main entry is `OhMyOpenCodePlugin(ctx)` in `oh-my-opencode/src/index.ts`.

Pipeline:

1. pre-init checks and auth injection
2. config load + merge (`plugin-config.ts`)
3. manager creation (`create-managers.ts`)
4. tool creation (`create-tools.ts`)
5. hook composition (`create-hooks.ts`)
6. OpenCode hook interface assembly (`plugin-interface.ts`)

Key files:

- `oh-my-opencode/src/index.ts`
- `oh-my-opencode/src/plugin-config.ts`
- `oh-my-opencode/src/create-managers.ts`
- `oh-my-opencode/src/create-tools.ts`
- `oh-my-opencode/src/create-hooks.ts`
- `oh-my-opencode/src/plugin-interface.ts`

## 2) Hook Tiering Strategy

`create-hooks.ts` composes multi-layer hooks (core/session/tool guards/continuation/skill helpers) and maps them to OpenCode hook points.

High-impact handlers:

- `event` aggregator and recovery logic
- `chat.message` and transforms
- `tool.execute.before` and `tool.execute.after`
- `experimental.chat.messages.transform`

Key files:

- `oh-my-opencode/src/plugin/event.ts`
- `oh-my-opencode/src/plugin/chat-message.ts`
- `oh-my-opencode/src/plugin/tool-execute-before.ts`
- `oh-my-opencode/src/plugin/tool-execute-after.ts`
- `oh-my-opencode/src/plugin/messages-transform.ts`
- `oh-my-opencode/src/plugin/hooks/create-session-hooks.ts`

## 3) Tool System

- Tool graph is built through `createToolRegistry(...)` with config-aware enable/disable and category mapping.
- It includes wrappers around OpenCode/agent/task/session capabilities and optional experimental tooling.
- Tool behavior is frequently shaped through before/after hook stages.

Key files:

- `oh-my-opencode/src/plugin/tool-registry.ts`
- `oh-my-opencode/src/create-tools.ts`

## 4) Config and Install Flow

- Config model supports user/project overlays and merge logic in `plugin-config.ts`.
- Installer flow updates OpenCode plugin list and writes plugin config in idempotent style.
- CLI installer pattern is suitable as a reference for one-shot install UX.

Key files:

- `oh-my-opencode/src/plugin-config.ts`
- `oh-my-opencode/src/cli/cli-installer.ts`
- `oh-my-opencode/src/cli/config-manager.ts`
- `oh-my-opencode/src/cli/config-manager/add-plugin-to-opencode-config.ts`

## 5) Compatibility Layer Characteristics

- It effectively acts as a second-layer orchestration platform over OpenCode hooks.
- It translates many policies/recovery behaviors into existing OpenCode surfaces rather than requiring core patches.
- It can coexist with plain OpenCode, but some optional features rely on environment/tool availability.

## 6) Practical Lessons for Universal HUD Plugin

What to reuse:

- staged bootstrap (`config -> managers -> tools -> hooks -> interface`)
- defensive event processing in `event` handler
- installer idempotency and config-safe mutation pattern

What not to inherit as hard dependency:

- tmux-centric pathways (keep optional only)
- cross-feature coupling unrelated to HUD output

## 7) Conclusion

`oh-my-opencode` demonstrates that substantial behavior can be layered on OpenCode without core changes. For a universal HUD target, the reusable pattern is its composition and installer discipline, while runtime output should remain anchored to OpenCode-native event/TUI surfaces so it works even when `oh-my-opencode` is absent.
