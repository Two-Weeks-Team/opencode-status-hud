# P4-1 Transport Feasibility Spike

Issue link: `#15 (P4-1)`

## Objective

Verify an officially supportable external publishing path for optional HUD viewer mode, define payload contract, and define backpressure behavior.

## Scope and Constraints

- Baseline HUD path must remain plugin-local and functional without publisher mode.
- No OpenCode core modification.
- No reliance on undocumented reducer or TUI event unions for baseline behavior.

## Findings

### 1) Supportable transport path

- The supportable path is plugin-level optional publisher dispatch from reduced HUD snapshots.
- Transport implementation can be injected as an optional callback/sink and gated by config.
- Baseline remains unchanged when publisher is disabled.

### 2) Unsupportable/high-risk path

- Direct dependence on undocumented or unstable OpenCode internal publish channels for external viewer coupling is high-risk.
- Any transport requiring OpenCode core patching is out of scope.

## Proposed Payload Contract (v1)

```json
{
  "version": 1,
  "sessionId": "string | null",
  "status": "idle | running | done | failed",
  "toolName": "string | null",
  "updatedAt": "number | null",
  "message": "string | null"
}
```

## Backpressure Strategy

- Transition-only publishing: publish only when reducer state transition changes meaningful snapshot fields.
- Cooldown/debounce window: optional per-session minimum interval.
- Drop-on-overload policy: if sink rejects or queue exceeds limit, drop newest publish attempt and keep baseline runtime unaffected.
- Non-blocking execution: publisher failures must not throw into reducer/output baseline path.

## Verification Checklist

- Publisher disabled: baseline tests remain green, no behavior drift.
- Publisher enabled: snapshots emit with bounded frequency.
- Sink failure injection: baseline state and user-visible outputs remain stable.

## Recommendation

**Go (Conditional):** proceed with P4-2 using a feature-flagged, disabled-by-default plugin-level publisher sink.

Conditions:

1. No baseline coupling when flag is off.
2. Explicit payload versioning (`version: 1`).
3. Bounded and non-blocking publish behavior.
4. Integration tests for enabled/disabled and sink-failure scenarios.
