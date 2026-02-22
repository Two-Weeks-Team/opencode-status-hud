# OpenCode HUD Quickstart (Alpha)

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
npm install
```

## Validation Commands

```bash
npm run typecheck
npm run test
npm run build
npm run ci
```

## Runtime Notes

- Baseline runtime is plugin-local and does not require `oh-my-opencode`.
- Default output posture is low-noise (`toast-only`, conservative prompt fallback).

## Installer Safety

- Installer/uninstaller recovery guide: `docs/INSTALLER_TROUBLESHOOTING.md`

## Minimal Usage Example

```ts
import {
  createInitialHudState,
  createInitialEmitControllerState,
  parseIncomingEvent,
  reduceHudState,
  emitToastOnStateTransition
} from "./src/index.js"

let state = createInitialHudState()
let emitState = createInitialEmitControllerState(0)

const parsed = parseIncomingEvent({
  type: "tool.execute.before",
  tool: { name: "bash" },
  ts: 1000
})

if (parsed.kind === "accepted" && parsed.event.type === "tool.execute.before") {
  const next = reduceHudState(state, {
    type: "tool.execute.before",
    toolName: parsed.event.toolName,
    ts: parsed.event.ts
  })

  await emitToastOnStateTransition({
    previousState: state,
    nextState: next,
    controllerState: emitState,
    nowMs: 1000,
    client: {
      tui: {
        showToast: (payload) => {
          console.log(payload)
        }
      }
    }
  })

  state = next
}
```
