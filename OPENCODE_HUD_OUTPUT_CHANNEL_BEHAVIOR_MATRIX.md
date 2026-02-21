# OpenCode HUD Output Channel Behavior Matrix

## Scope

This document records baseline behavior expectations for HUD output channels.

- Primary channel: `tui.showToast`
- Fallback channel: `tui.appendPrompt`
- Goal: define safe defaults and emission policy for Phase 1/2 runtime work

## Evaluation Axes

- Visibility: whether users reliably notice state transition updates
- Intrusiveness: disruption risk to active coding flow
- Durability: whether output persists for later inspection
- Noise Risk: spam potential under bursty event streams
- Formatting Risk: likelihood of unreadable output when payloads are large

## Behavior Matrix (Baseline)

| Channel | Visibility | Intrusiveness | Durability | Noise Risk | Formatting Risk | Notes |
|---|---|---|---|---|---|---|
| `tui.showToast` | High | Low-Medium | Low | Medium | Low | Best for concise transition signals |
| `tui.appendPrompt` | Medium | Medium-High | High | High | Medium-High | Useful as fallback only with strict gating |

## Event Burst Behavior Expectations

| Scenario | `tui.showToast` expectation | `tui.appendPrompt` expectation |
|---|---|---|
| Single tool run | one concise update | one summary line allowed |
| Rapid tool bursts | dedupe + cooldown must suppress repeats | default should suppress most emissions |
| Missing optional fields | skip or degrade gracefully | skip output if summary quality is poor |
| Unknown event type | no output | no output |

## Recommended Default Policy

1. Channel priority
   - default: `tui.showToast` only
   - fallback: `tui.appendPrompt` disabled by default

2. Emission controls
   - transition-only emission (same wording as vNext: transition-only emit)
   - cooldown window required (target 500-1500ms)
   - dedupe by `(sessionId, eventType, normalizedMessage)`
   - stale-state guard: if a terminal transition (`done`/`error`) is waiting behind cooldown, flush immediately at cooldown boundary

3. Fallback enablement guard
   - enable prompt fallback only for conservative profile
   - permit sparse summaries only (`done`, `error`, `waiting` transitions)
   - avoid verbose payload dumps

## Constraints and Risk Notes

- Must not assume unknown reducer event rendering support.
- Must not depend on `oh-my-opencode` for baseline visibility.
- Prompt fallback must not pollute normal coding flow.

## Terminology Alignment

- `transition-only emission` == `transition-only emit` (vNext plan wording)
- `noise risk` corresponds to `output flood / UX degradation` in `OPENCODE_HUD_UNIVERSAL_PLAN_VNEXT.md`
- `fallback channel` means `appendPrompt` in conservative profile only

## Decision for P0-2 DoD

- Behavior matrix published: yes
- Default channel policy documented: yes (`toast` primary, prompt fallback conservative)
