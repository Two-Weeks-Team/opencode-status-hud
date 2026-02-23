# OpenCode HUD Quickstart (Alpha)

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
npm install
npm run build
```

## CLI Install/Uninstall

```bash
node ./bin/opencode-status-hud.js install
node ./bin/opencode-status-hud.js resolve-config
node ./bin/opencode-status-hud.js uninstall
```

Installed as plugin, runtime activates when you run `opencode`.

## Validation Commands

```bash
npm run typecheck
npm run test
npm run build
npm run ci
bash scripts/verify-tmux-runtime.sh
HUD_TMUX_LIVE=1 bash scripts/verify-tmux-runtime.sh
```

## Runtime Notes

- Baseline runtime is plugin-local and does not require `oh-my-opencode`.
- Default output posture appends HUD usage to assistant output messages (`usageDisplay=output`).
- Output strip shape: `BOT <model> | <bar> | <percent> | <used>/<limit> | <cost> | 5h:<...> | 7d:<...>`.

Default launch:

```bash
opencode
```

Optional override (only if you want to tune behavior):

```bash
export OPENCODE_STATUS_HUD_USAGE_DISPLAY=output+toast
# Prompt mode remains available if explicitly needed
# export OPENCODE_STATUS_HUD_USAGE_DISPLAY=prompt
# export OPENCODE_STATUS_HUD_USAGE_PROMPT_INTERVAL_MS=10000
opencode
```

## Installer Safety

- Installer/uninstaller recovery guide: `docs/INSTALLER_TROUBLESHOOTING.md`
- Human/LLM install flow: `docs/guide/installation.md`

## Minimal Usage Example

```ts
import {
  createInitialHudState,
  createInitialEmitControllerState,
  parseIncomingEvent,
  reduceHudState,
  emitToastOnStateTransition
} from "./src/api.js"

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
