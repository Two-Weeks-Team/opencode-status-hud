# OpenCode Universal HUD Plan

## 1. Objective

- Provide reliable HUD-style status output in OpenCode regardless of whether `oh-my-opencode` is installed.
- Do not require tmux.
- Do not modify OpenCode core.
- Support one-command install/uninstall, similar to the user experience of `oh-my-opencode`.

## 2. Scope and Constraints

### In Scope

- A standalone OpenCode plugin package for status output.
- A one-shot installer CLI that updates OpenCode config safely.
- Runtime fallback behavior across multiple display channels.

### Out of Scope

- Direct sidebar/panel component injection into OpenCode web UI.
- Any OpenCode core patch.
- Any mandatory dependency on tmux.

### Technical Constraints (from code analysis)

- OpenCode plugin surface is hook-based (`Plugin -> Hooks`) and event-driven.
- Available practical output surfaces are TUI APIs (`showToast`, `appendPrompt`, command execution) and event-driven external consumers.
- Web UI reducer only reflects known event contracts; unknown custom events are not guaranteed to render.

## 3. Architecture Decision

Build a standalone package: `opencode-hud-universal`

- Core runtime = OpenCode plugin hooks (`event`, `tool.execute.before`, `tool.execute.after`, optional `chat.*`).
- HUD state = derived from known session/tool/todo/message events.
- Display strategy = priority-based multi-channel fallback:
  1) TUI toast (`client.tui.showToast`)
  2) Prompt append (`client.tui.appendPrompt`)
  3) Optional external listener via existing SSE/event stream (non-blocking extension)

This ensures baseline operation on plain OpenCode without `oh-my-opencode`.

## 4. Deliverables

1. Runtime plugin package
   - File: `packages/opencode-hud-universal/src/index.ts`
   - Exposes OpenCode-compliant hooks.

2. Installer CLI
   - File: `packages/opencode-hud-universal/src/cli/install.ts`
   - Command: `npx opencode-hud-universal install`
   - Adds plugin entry to OpenCode config idempotently.

3. Uninstaller CLI
   - Command: `npx opencode-hud-universal uninstall`
   - Removes plugin entry only; no destructive side effects.

4. Config schema + defaults
   - HUD frequency, channel preference, minimal redaction policy.

5. Docs
   - Quickstart, fallback behavior, compatibility notes.

## 5. Implementation Plan (Phased)

### Phase 1 - Plugin Baseline

- Implement event collector for stable event types only.
- Build in-memory HUD state model:
  - active session
  - latest tool activity
  - todo progress summary
  - recent status transition
- Render compact summary through toast with rate limit.

Success criteria:

- Works in OpenCode with no `oh-my-opencode` installed.
- No crash when specific event types are absent.

### Phase 2 - Prompt Fallback + Robustness

- Add prompt-append fallback when toast is not useful/available.
- Add throttling/debouncing and duplicate suppression.
- Add safe guards for large payloads and missing properties.

Success criteria:

- Stable output in long sessions.
- No noisy spam under rapid event bursts.

### Phase 3 - One-Shot Installer Experience

- Implement installer/uninstaller commands.
- Auto-detect OpenCode config path, backup once, idempotent patching.
- Preserve existing plugin list order and avoid duplicates.

Success criteria:

- `install` and `uninstall` are reversible and safe.
- Existing config remains valid after repeated runs.

### Phase 4 - Optional External Viewer (Non-Required)

- Add optional mode to publish summarized HUD snapshot for external viewer.
- Keep plugin fully functional without this mode.

Success criteria:

- Baseline behavior unchanged when optional viewer is disabled.

## 6. Runtime Behavior Specification

### Event Intake

- Listen through plugin `event` hook.
- Accept only known, validated event types.
- Ignore unknown events silently.

### Aggregation Rules

- Maintain last-known snapshot per session.
- Update minimal fields atomically.
- Emit UI output only when meaningful state changes occur.

### Output Rules

- Primary: toast output for concise state line.
- Secondary: append prompt for sticky textual context.
- Enforce cooldown window (e.g., 500-1500 ms configurable).

## 7. Compatibility Policy

- Must run when `oh-my-opencode` is missing.
- If `oh-my-opencode` exists, no hard dependency and no takeover.
- Any optional integration is additive and feature-flagged.

## 8. Risk Register and Mitigations

1. Event flood causes noisy UI
   - Mitigation: debounce, dedupe key, cooldown window.

2. Inconsistent event payload shapes
   - Mitigation: schema guards + defensive parsing.

3. Config corruption risk during install
   - Mitigation: backup, transactional write, idempotent merge.

4. Over-coupling to unofficial events
   - Mitigation: support only documented/observed stable contracts.

## 9. Verification Plan

### Functional

- OpenCode only (no `oh-my-opencode`): output appears and updates.
- OpenCode + `oh-my-opencode`: both can coexist without breakage.
- Install/uninstall repeatedly: no duplicate plugin entries.

### Stability

- Long-running session test with high event frequency.
- Missing/partial payload simulation.

### Quality Gates

- Typecheck passes.
- Plugin-specific tests pass.
- Lint passes.

## 10. Rollout Plan

1. Internal alpha (plugin-only users).
2. Beta with installer command.
3. General release with docs and rollback guide.

Rollback:

- Run uninstall command.
- Remove plugin entry manually if needed.
- Restore config from installer backup.

## 11. Definition of Done

- Standalone plugin runs on OpenCode without `oh-my-opencode`.
- One-command install/uninstall works safely.
- HUD output is visible and rate-controlled without tmux.
- Docs published with explicit limitations and fallback behavior.
