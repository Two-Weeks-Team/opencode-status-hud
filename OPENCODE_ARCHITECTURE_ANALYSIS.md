# OpenCode Architecture Analysis

## Purpose

This document summarizes the OpenCode internals relevant to plugin-based HUD/output design under these constraints:

- no OpenCode core modification
- no tmux dependency
- must work in plain OpenCode runtime

## 1) Plugin Lifecycle

- Plugin contract is `Plugin(input) -> Hooks` in `opencode/packages/plugin/src/index.ts`.
- Loader initializes plugins in `opencode/packages/opencode/src/plugin/index.ts`.
- Hook dispatch model is sequential and mutative (`trigger(name, input, output)` updates output through all loaded hooks).
- Event hookup is centralized: `Plugin.init()` subscribes to all bus events and forwards to `hook.event`.

Key files:

- `opencode/packages/plugin/src/index.ts`
- `opencode/packages/opencode/src/plugin/index.ts`

## 2) Event Pipeline

- Events are declared via `BusEvent.define(...)` in `opencode/packages/opencode/src/bus/bus-event.ts`.
- Runtime publish/subscribe lives in `opencode/packages/opencode/src/bus/index.ts`.
- Global fanout is bridged by `GlobalBus` in `opencode/packages/opencode/src/bus/global.ts`.
- Session/message/tool status events are emitted from session/runtime modules and consumed by plugin `event` hooks.

Key files:

- `opencode/packages/opencode/src/bus/bus-event.ts`
- `opencode/packages/opencode/src/bus/index.ts`
- `opencode/packages/opencode/src/bus/global.ts`
- `opencode/packages/opencode/src/session/index.ts`
- `opencode/packages/opencode/src/session/message-v2.ts`

## 3) TUI/API Output Surfaces

Practical output surfaces available without core patch:

- `tui.showToast`
- `tui.appendPrompt`
- `tui.executeCommand`
- `tui.publish` (bounded by known `TuiEvent` schema)

These are routed via TUI endpoints and SDK clients.

Key files:

- `opencode/packages/opencode/src/server/routes/tui.ts`
- `opencode/packages/opencode/src/cli/cmd/tui/event.ts`
- `opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`

## 4) Web/Desktop Event Consumption

- App sync layer consumes server/global events and applies reducer logic.
- Reducer behavior is contract-based; unknown event shapes are not guaranteed to render in UI.
- Status and titlebar components are app-owned UI, not plugin-injectable via current plugin API.

Key files:

- `opencode/packages/app/src/context/global-sync.tsx`
- `opencode/packages/app/src/context/global-sync/event-reducer.ts`
- `opencode/packages/app/src/components/status-popover.tsx`
- `opencode/packages/app/src/components/titlebar.tsx`

## 5) Hard Limits (Evidence-Based)

- No plugin API for direct sidebar/panel component injection.
- No explicit plugin dispose/unload hook in public hook contract.
- Hook execution order is loader order, not explicit priority API.
- TUI publish path validates known event unions.

## 6) Leverage Points for Universal HUD

Highest-value extension points with no core change:

1. `event` hook for state aggregation (session/tool/todo lifecycle)
2. `tool.execute.before/after` for shaping tool-level status metadata
3. `tui.showToast` + `tui.appendPrompt` as baseline output channels

## 7) Conclusion

OpenCode already provides enough plugin/runtime surfaces to ship a universal HUD-lite plugin that is independent of `oh-my-opencode`, as long as implementation stays inside existing hook and TUI/event contracts.
