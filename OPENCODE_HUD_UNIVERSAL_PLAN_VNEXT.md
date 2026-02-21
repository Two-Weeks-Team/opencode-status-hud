# OpenCode Universal HUD Plan (vNext)

## 1. Purpose

This vNext plan strengthens the original universal HUD plan with stricter event-contract controls, phased go/no-go gates, and safer installer design.

Primary outcomes:

- Keep HUD behavior reliable in plain OpenCode (no `oh-my-opencode`, no tmux requirement)
- Stay inside public plugin/TUI surfaces only
- Deliver reversible one-command install/uninstall with idempotent config patching
- De-risk optional external viewer by isolating it behind a proof gate

## 2. Confirmed Constraints (Must Hold)

From `OPENCODE_ARCHITECTURE_ANALYSIS.md` and `OPENCODE_HUD_UNIVERSAL_PLAN.md`:

- No OpenCode core modification
- No mandatory tmux dependency
- No direct plugin API for web sidebar/panel injection
- Hook execution order is loader order (no priority API)
- `tui.publish` accepts bounded known event unions
- Unknown web reducer event shapes are not guaranteed to render
- No explicit public plugin dispose/unload hook

Design consequence: vNext targets HUD-lite through hook + TUI channels only.

## 3. vNext Architecture

### Runtime Components

1. `EventIntake`
   - Hook sources: `tool.execute.before`, `tool.execute.after`, `event`
   - Policy: allowlist known contracts, drop unknown events silently

2. `StateReducer`
   - Session-scoped snapshot with bounded memory
   - Fields: active tool, last tool result, tool duration, recent status transition, optional todo summary

3. `EmitController`
   - Emits only meaningful state transitions
   - Cooldown + dedupe + rate cap

4. `OutputChannels`
   - Primary: `client.tui.showToast`
   - Secondary: `client.tui.appendPrompt` (sparse, configurable)
   - Optional: external viewer publishing path (disabled by default, gated)

5. `ConfigManager`
   - Safe defaults, strict validation, forward-compatible schema versioning

### Safety Principles

- No unbounded buffers
- No assumptions about unavailable fields
- No channel spam under bursty events
- No hard dependency on other plugins

## 4. Event Contract Strategy (New)

The largest implementation risk is event-shape drift. vNext introduces an explicit contract inventory step.

### 4.1 Contract Inventory

- Audit event names/payloads from known OpenCode surfaces before coding reducer logic
- Classify each event:
  - `required`: HUD core cannot function without it
  - `supported`: enriches HUD if present
  - `ignored`: unsupported/experimental/unverified

### 4.2 Version Pinning

- Pin compatible OpenCode version range in package docs
- Keep a compatibility matrix for tested versions

### 4.3 Guarded Parsing

- Parse via schema guards
- On parse failure: drop event + optional debug log (never throw)

## 5. Phased Delivery With Gates

## Phase 0 - Feasibility Spike (Required)

Goal: remove unknowns before full implementation.

Deliverables:

- Event contract inventory (allowlist draft)
- Channel behavior notes for `showToast`/`appendPrompt`
- Coexistence check notes with `oh-my-opencode`

Gate to proceed:

- Core event subset identified and reproducible
- At least one stable output channel validated

Go/No-Go:

- **Go** if event subset + output channel both pass
- **No-Go** if neither can be made stable without core changes

## Phase 1 - HUD Core (MVP)

Goal: reliable baseline HUD without optional integrations.

Scope:

- Reducer driven first by `tool.execute.before/after`
- Optional enrichment from vetted `event` allowlist
- Toast output with cooldown and dedupe
- Bounded in-memory session state

Acceptance:

- Works without `oh-my-opencode`
- No crash on missing/partial payloads
- No noisy toast spam under burst events

Go/No-Go:

- **Go** on stable long-session behavior
- **No-Go** if state/output instability persists under guardrails

## Phase 2 - Fallback + Robustness

Goal: improve reliability and operator control.

Scope:

- `appendPrompt` fallback (default conservative)
- Duplicate suppression improvements
- Payload truncation and defensive formatting
- Configurable emission profiles (`minimal`, `balanced`, `verbose`)

Acceptance:

- Prompt channel remains readable over long sessions
- Emissions stay within configured rate limits
- Unknown events remain no-op

Go/No-Go:

- **Go** if fallback helps without degrading UX
- **No-Go** if prompt channel consistently pollutes workflow

## Phase 3 - Installer / Uninstaller

Goal: one-command safe lifecycle management.

Scope:

- `install`: detect config path, backup once, idempotent add/merge
- `uninstall`: remove plugin entry only, keep unrelated settings intact
- Transactional write flow: validate -> temp write -> atomic rename

Acceptance:

- Repeated install/uninstall yields no duplicates and valid config
- Rollback path is documented and tested
- Existing plugin order preserved as much as possible

Go/No-Go:

- **Go** if config integrity is provably preserved
- **No-Go** if path detection or validation is not deterministic

## Phase 4 - Optional External Viewer (Isolated)

Goal: additive viewer mode without impacting baseline HUD.

Scope:

- Feature-flagged publishing path only
- No dependency from baseline runtime to viewer pipeline

Entry gate:

- Confirm officially supported transport/event path for external consumption
- Confirm payload contract and backpressure behavior

Go/No-Go:

- **Conditional Go** only after transport proof
- **Default No-Go** if proof is missing

## 6. Risk Controls (Top 5)

1. Event contract drift
   - Control: allowlist + schema guards + compatibility matrix

2. Output flood / UX degradation
   - Control: cooldown (500-1500 ms), dedupe key, transition-only emit

3. Memory growth in long sessions
   - Control: per-session caps, ring buffers, periodic pruning

4. Plugin coexistence conflicts
   - Control: low-noise defaults, configurable channels, no takeover logic

5. Config corruption during install
   - Control: backup once, transactional writes, post-write validation, rollback

## 7. Verification Plan (Executable)

### Functional

- OpenCode only: HUD updates visible
- OpenCode + `oh-my-opencode`: coexistence without breakage
- Missing event fields: no crash, safe degrade

### Stability

- Burst event simulation: no spam and no freeze
- Long-session run: bounded memory behavior verified

### Installer Safety

- N repeated installs: no duplicate entries
- N repeated uninstall/install cycles: config remains valid
- Rollback from backup restores previous state

### Quality Gates

- Typecheck passes
- Plugin tests pass
- Lint passes

## 8. Implementation Checklist

## 8.1 Phase 0

- [ ] Build event allowlist inventory
- [ ] Document unsupported events and reasons
- [ ] Validate baseline output channels in target runtimes

## 8.2 Phase 1-2

- [ ] Implement guarded intake + reducer
- [ ] Implement emit controller (cooldown/dedupe)
- [ ] Add fallback profile settings and defaults
- [ ] Add stability tests for burst/partial payloads

## 8.3 Phase 3

- [ ] Implement config path detection
- [ ] Implement backup + transactional write
- [ ] Implement idempotent add/remove logic
- [ ] Add install/uninstall repeatability tests

## 8.4 Phase 4 (Optional)

- [ ] Complete transport feasibility spike
- [ ] Add feature flag and disabled-by-default behavior
- [ ] Validate zero baseline regression when disabled

## 9. Reference Implementations (For Pattern Reuse)

Directly relevant category:

- `https://github.com/anomalyco/opencode`
- `https://github.com/code-yeongyu/oh-my-opencode`
- `https://github.com/islee23520/opencode-sidebar-tui`
- `https://github.com/mohak34/opencode-notifier`
- `https://github.com/shekohex/opencode-pty`

Adjacent category (statusline/TUI dashboard):

- `https://github.com/rz1989s/claude-code-statusline`
- `https://github.com/seunggabi/claude-dashboard`
- `https://github.com/jedarden/ccdash`
- `https://github.com/dlvhdr/gh-dash`

## 10. Definition of Done (vNext)

vNext is complete when all are true:

- HUD runs on plain OpenCode with no tmux requirement
- Baseline channels (`showToast` and optional `appendPrompt`) are rate-controlled and stable
- Installer/uninstaller are idempotent, reversible, and config-safe
- Compatibility limits are explicit in docs
- Optional external viewer remains isolated and disabled unless proven/supported
