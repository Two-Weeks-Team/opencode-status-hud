# OpenCode HUD Event Contract Allowlist (Draft)

## Scope

This inventory defines the initial event contract policy for HUD runtime implementation.

- Goal: prevent runtime breakage from event drift
- Source baseline: `OPENCODE_ARCHITECTURE_ANALYSIS.md`
- Policy: strict allowlist + guarded parsing + silent drop for unknown/malformed inputs

## Classification Rules

- `required`: HUD core relies on these to function
- `supported`: optional enrichments; safe to consume when present
- `ignored`: unsupported, unknown, or unstable contracts; dropped by default

## Required Contracts

### 1) `tool.execute.before`
- Why required: needed to derive active tool and execution start transition
- Usage in reducer: set `activeTool`, `status=running`, start timing window

Sample payload shape (draft):

```json
{
  "type": "tool.execute.before",
  "tool": {
    "name": "bash"
  },
  "session": {
    "id": "ses_xxx"
  },
  "ts": 1730000000000
}
```

### 2) `tool.execute.after`
- Why required: needed to derive completion transition and duration
- Usage in reducer: clear `activeTool`, set `lastResult`, compute duration, update status

Sample payload shape (draft):

```json
{
  "type": "tool.execute.after",
  "tool": {
    "name": "bash"
  },
  "result": {
    "ok": true,
    "exitCode": 0
  },
  "session": {
    "id": "ses_xxx"
  },
  "ts": 1730000001200
}
```

## Supported Contracts

### 3) `event` (generic stream)
- Why supported: can enrich HUD with non-critical context when payload is parseable
- Usage in reducer: optional updates only; never required for core state transition
- Guard: process only allowlisted `event.name` subtypes; ignore others

Sample payload shape (draft):

```json
{
  "type": "event",
  "name": "session.update",
  "payload": {
    "phase": "thinking"
  },
  "session": {
    "id": "ses_xxx"
  },
  "ts": 1730000000800
}
```

### 4) `tui.showToast` output contract
- Why supported: primary HUD emission channel in baseline path
- Usage: final rendered transition notification after cooldown/dedupe checks

Sample output payload shape (draft):

```json
{
  "title": "HUD",
  "message": "bash completed in 1.2s",
  "variant": "info"
}
```

### 5) `tui.appendPrompt` output contract
- Why supported: fallback output channel for constrained situations
- Usage: disabled/conservative by default, only for sparse transition summaries

Sample output payload shape (draft):

```json
{
  "content": "[HUD] tool=bash status=done duration=1.2s"
}
```

## Ignored Contracts (Current Draft)

### A) Unknown/undocumented web reducer events
- Reason: not guaranteed to render in web UI
- Action: ignore until explicit support proof exists

### B) External viewer transport events (ungated)
- Reason: Phase 4 is conditional and requires explicit transport proof
- Action: ignore in baseline runtime

### C) Any payload failing schema guards
- Reason: safety first; avoid runtime throw or noisy fallback
- Action: drop and optionally emit debug-only telemetry

## Parser Guard Policy

- Validate top-level `type` as string
- Validate required nested keys per contract
- Accept partial optional fields only when non-critical
- On validation failure: return `ignored` decision, no throw

## Compatibility Notes

- This file is a draft inventory for Issue `#1 (P0-1)`.
- Finalized compatibility matrix by OpenCode version is tracked in later bootstrap/setup work (`#3`).
- Contract additions must include: rationale, sample payload, and impact classification.
